import type { File as GCSFile } from "@google-cloud/storage";
import { db, receiptsTable, receiptAttachmentsTable, uploadIntentsTable, userBillingTable, userPreferencesTable, type ReceiptNotableItem } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";
import { sendWarrantyReminderEmail, sendTrialEndingEmail, sendReturnWindowEmail } from "./emailService";
import { claimScheduledRun } from "./scheduledJobLock";
import { getSubscriptionStatus } from "./subscriptionStatus";

/**
 * Reminders (warranty + return window, email + push) go only to users who
 * currently have access: an active no-card trial (including at the receipt
 * cap), a paid plan, a legacy Stripe trial, or the owner. Expired or unpaid
 * accounts are skipped. Cached per sweep.
 */
function reminderAccessChecker(): (userId: string) => Promise<boolean> {
  const cache = new Map<string, boolean>();
  return async (userId: string) => {
    if (cache.has(userId)) return cache.get(userId)!;
    let allowed = false;
    try {
      allowed = !userId.startsWith("guest_") && (await getSubscriptionStatus(userId)).canUseApp === true;
    } catch (err) {
      logger.warn({ err, userId }, "Reminder access check failed; skipping user this run");
    }
    cache.set(userId, allowed);
    return allowed;
  };
}
import { sendPushNotification } from "./pushNotifications";
import { calcReturnWindow } from "./returnWindowCalc";
import { runDataRetentionSweep } from "./accountLifecycle";
import { syncWarrantyExpiries, warrantyInputColumns } from "./warrantyExpiryStore";

const ORPHAN_AGE_THRESHOLD_DAYS = 7;
const ORPHAN_AGE_THRESHOLD_MS = ORPHAN_AGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/** Parse "/bucket/path/..." → { bucketName, dirPrefix } */
function parsePrivateDir(dir: string): { bucketName: string; dirPrefix: string } {
  const parts = dir.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const dirPrefix = parts.slice(1).join("/");
  return { bucketName, dirPrefix };
}

/** Convert a GCS object name back to the /objects/... path stored in the DB */
function objectNameToPath(objectName: string, dirPrefix: string): string | null {
  const uploadsPrefix = (dirPrefix ? dirPrefix.replace(/\/$/, "") + "/" : "") + "uploads/";
  if (!objectName.startsWith(uploadsPrefix)) return null;
  const entityId = "uploads/" + objectName.slice(uploadsPrefix.length);
  return `/objects/${entityId}`;
}

async function runOrphanFileCleanup(): Promise<void> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!privateDir) {
    logger.warn("PRIVATE_OBJECT_DIR not set — skipping orphan cleanup");
    return;
  }

  const { bucketName, dirPrefix } = parsePrivateDir(privateDir);
  const uploadsPrefix = (dirPrefix ? dirPrefix.replace(/\/$/, "") + "/" : "") + "uploads/";

  logger.info({ bucketName, uploadsPrefix }, "Orphan cleanup starting");

  let knownPaths: Set<string>;
  try {
    const receiptRows = await db.select({ objectPath: receiptsTable.objectPath }).from(receiptsTable);
    const attachmentRows = await db
      .select({ objectPath: receiptAttachmentsTable.objectPath })
      .from(receiptAttachmentsTable)
      .innerJoin(receiptsTable, eq(receiptAttachmentsTable.receiptId, receiptsTable.id));
    const activeUploadRows = await db
      .select({ objectPath: uploadIntentsTable.objectPath })
      .from(uploadIntentsTable)
      .where(gt(uploadIntentsTable.expiresAt, new Date()));
    knownPaths = new Set([
      ...receiptRows.map((r) => r.objectPath),
      ...attachmentRows.map((a) => a.objectPath),
      ...activeUploadRows.map((u) => u.objectPath),
    ]);
    logger.info({ count: knownPaths.size }, "Loaded known object paths from DB");
  } catch (err) {
    logger.error({ err }, "Orphan cleanup: failed to query DB, aborting");
    return;
  }

  const bucket = objectStorageClient.bucket(bucketName);
  let files: GCSFile[];
  try {
    [files] = await bucket.getFiles({ prefix: uploadsPrefix });
    logger.info({ count: files.length }, "Listed storage objects under uploads prefix");
  } catch (err) {
    logger.error({ err }, "Orphan cleanup: failed to list storage objects, aborting");
    return;
  }

  const cutoffTime = Date.now() - ORPHAN_AGE_THRESHOLD_MS;

  let orphansDeleted = 0;
  let orphansSkippedTooNew = 0;
  let deleteErrors = 0;

  for (const file of files) {
    const objectPath = objectNameToPath(file.name, dirPrefix);
    if (objectPath === null) continue;

    if (knownPaths.has(objectPath)) continue;

    const timeCreated = file.metadata?.timeCreated as string | undefined;
    if (!timeCreated) {
      logger.warn({ objectName: file.name }, "Orphan cleanup: file has no timeCreated metadata, skipping");
      continue;
    }

    const createdAt = new Date(timeCreated).getTime();
    if (isNaN(createdAt) || createdAt > cutoffTime) {
      orphansSkippedTooNew++;
      continue;
    }

    try {
      await file.delete();
      logger.info(
        { objectName: file.name, objectPath, ageMs: Date.now() - createdAt },
        "Orphan cleanup: deleted orphaned storage file",
      );
      orphansDeleted++;
    } catch (err) {
      deleteErrors++;
      logger.error({ err, objectName: file.name }, "Orphan cleanup: failed to delete file");
    }
  }

  logger.info(
    {
      orphansDeleted,
      orphansSkippedTooNew,
      deleteErrors,
      thresholdDays: ORPHAN_AGE_THRESHOLD_DAYS,
    },
    "Orphan cleanup complete",
  );

}

const MS_PER_DAY = 86_400_000;
/**
 * Warranty reminders go out once per expiry date, as soon as it is 30 days or
 * less away (and not past). A receipt added with 5 days left still gets one.
 */
const WARRANTY_REMINDER_MIN_DAYS = 0;
const WARRANTY_REMINDER_MAX_DAYS = 30;

type WarrantyKind = "legal" | "manufacturer";

/**
 * Exported for tests; runs daily from runDailyMaintenance. Users without current access are skipped.
 * Each receipt's legal (PT/EU) and manufacturer warranty end dates are computed on
 * the server (lib/warrantyExpiry.ts), stored in receipts.*_warranty_expires_on and
 * reminded separately, each deduplicated by its own end date.
 */
export async function runWarrantyReminderSweep(now = new Date()): Promise<{ sent: number; failed: number; skippedOptOut: number; skippedNoAccess: number }> {
  const warrantyReceipts = await db
    .select({
      ...warrantyInputColumns,
      userId: receiptsTable.userId,
      originalFileName: receiptsTable.originalFileName,
      warrantyReminderSentFor: receiptsTable.warrantyReminderSentFor,
      legalWarrantyReminderSentFor: receiptsTable.legalWarrantyReminderSentFor,
      legalWarrantyPushSentFor: receiptsTable.legalWarrantyPushSentFor,
      manufacturerWarrantyPushSentFor: receiptsTable.manufacturerWarrantyPushSentFor,
    })
    .from(receiptsTable)
    .where(eq(receiptsTable.status, "completed"));

  const todayUtc = new Date(now);
  todayUtc.setUTCHours(0, 0, 0, 0);
  const minMs = todayUtc.getTime() + WARRANTY_REMINDER_MIN_DAYS * MS_PER_DAY;
  const maxMs = todayUtc.getTime() + WARRANTY_REMINDER_MAX_DAYS * MS_PER_DAY;
  const isDue = (iso: string | null): iso is string => {
    if (!iso) return false;
    const expiryMs = new Date(`${iso}T00:00:00Z`).getTime();
    return expiryMs >= minMs && expiryMs <= maxMs;
  };

  const optOutCache = new Map<string, boolean>();
  async function isOptedOut(userId: string): Promise<boolean> {
    if (optOutCache.has(userId)) return optOutCache.get(userId)!;
    const [row] = await db
      .select({ notificationsOptOut: userPreferencesTable.notificationsOptOut })
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId))
      .limit(1);
    const optOut = row?.notificationsOptOut ?? false;
    optOutCache.set(userId, optOut);
    return optOut;
  }

  const hasAccess = reminderAccessChecker();
  let sent = 0;
  let failed = 0;
  let skippedOptOut = 0;
  let skippedNoAccess = 0;
  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
  for (const r of warrantyReceipts) {
    const expiries = await syncWarrantyExpiries(r);
    const candidates: Array<{ kind: WarrantyKind; due: string; emailPrev: string | null; pushPrev: string | null }> = [];
    if (isDue(expiries.manufacturer)) {
      candidates.push({ kind: "manufacturer", due: expiries.manufacturer, emailPrev: r.warrantyReminderSentFor, pushPrev: r.manufacturerWarrantyPushSentFor });
    }
    if (isDue(expiries.legal)) {
      candidates.push({ kind: "legal", due: expiries.legal, emailPrev: r.legalWarrantyReminderSentFor, pushPrev: r.legalWarrantyPushSentFor });
    }
    const pending = candidates.filter(c => c.emailPrev !== c.due || c.pushPrev !== c.due);
    if (pending.length === 0) continue;
    if (!(await hasAccess(r.userId))) {
      skippedNoAccess++;
      continue;
    }
    // Email respects the email opt-out; browser push is managed by the device subscription.
    const optedOut = await isOptedOut(r.userId);
    if (optedOut && pending.some(c => c.emailPrev !== c.due)) skippedOptOut++;
    for (const { kind, due, emailPrev, pushPrev } of pending) {
      if (emailPrev !== due && !optedOut) {
        const column = kind === "legal" ? receiptsTable.legalWarrantyReminderSentFor : receiptsTable.warrantyReminderSentFor;
        const mark = (value: string | null) => kind === "legal"
          ? { legalWarrantyReminderSentFor: value }
          : { warrantyReminderSentFor: value };
        // Claim before sending so concurrent sweeps never double-send.
        const claimed = await db
          .update(receiptsTable)
          .set(mark(due))
          .where(and(eq(receiptsTable.id, r.id), emailPrev === null ? isNull(column) : eq(column, emailPrev)))
          .returning({ id: receiptsTable.id });
        if (claimed.length > 0) {
          const ok = await sendWarrantyReminderEmail(r.userId, {
            id: r.id,
            merchant: r.merchant,
            warranty: r.warranty,
            originalFileName: r.originalFileName,
            kind,
            expiresOn: due,
          });
          if (ok) {
            sent++;
          } else {
            failed++;
            // Release the claim so the next daily run retries.
            await db.update(receiptsTable).set(mark(emailPrev))
              .where(and(eq(receiptsTable.id, r.id), eq(column, due)));
          }
        }
      }
      if (pushPrev !== due) {
        const column = kind === "legal" ? receiptsTable.legalWarrantyPushSentFor : receiptsTable.manufacturerWarrantyPushSentFor;
        const mark = (value: string | null) => kind === "legal"
          ? { legalWarrantyPushSentFor: value }
          : { manufacturerWarrantyPushSentFor: value };
        const claimed = await db
          .update(receiptsTable)
          .set(mark(due))
          .where(and(eq(receiptsTable.id, r.id), pushPrev === null ? isNull(column) : eq(column, pushPrev)))
          .returning({ id: receiptsTable.id });
        if (claimed.length > 0) {
          const pushed = await sendPushNotification(r.userId, {
            title: "Warranty ending soon",
            body: `${r.merchant || "Your purchase"} · ${kind === "legal" ? "legal warranty" : "manufacturer warranty"} ends ${fmtDay(due)}`,
            receiptId: r.id,
          });
          if (!pushed) {
            await db.update(receiptsTable).set(mark(pushPrev))
              .where(and(eq(receiptsTable.id, r.id), eq(column, due)));
          }
        }
      }
    }
  }
  if (sent || failed || skippedOptOut || skippedNoAccess) {
    logger.info({ sent, failed, skippedOptOut, skippedNoAccess }, "Warranty reminder sweep complete");
  }
  return { sent, failed, skippedOptOut, skippedNoAccess };
}

/** Orphan files, then each reminder sweep independently (one failure never blocks the others). */
async function runDailyMaintenance(): Promise<void> {
  try {
    await runOrphanFileCleanup();
  } catch (err) {
    logger.error({ err }, "Orphan cleanup failed");
  }
  try {
    await runWarrantyReminderSweep();
  } catch (err) {
    logger.error({ err }, "Warranty reminder sweep failed");
  }
  // Legacy Stripe-trial ending reminders — once per subscription
  try {
    await runTrialReminderSweep({ dryRun: false });
  } catch (err) {
    logger.error({ err }, "Trial reminder sweep failed");
  }
  // Return window reminders — 7-day and 2-day alerts for online purchases
  try {
    await runReturnWindowSweep();
  } catch (err) {
    logger.error({ err }, "Return window sweep failed");
  }
  // Frozen accounts: deletion warnings and 60-day deletion (dry run unless
  // DATA_DELETION_ENABLED=true).
  try {
    await runDataRetentionSweep();
  } catch (err) {
    logger.error({ err }, "Data retention sweep failed");
  }
}

export interface TrialReminderDryRunResult {
  userId: string;
  trialEnd: string;
  alreadySent: boolean;
}

/**
 * Run the trial-reminder sweep.
 * - dryRun: true  → log what would be sent, return matched rows, touch nothing
 * - dryRun: false → normal live send path (used by the nightly scheduler)
 */
export async function runTrialReminderSweep(options: { dryRun: boolean }): Promise<TrialReminderDryRunResult[]> {
  const { dryRun } = options;
  const MS_PER_DAY = 86_400_000;
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const windowStart = Math.floor(todayUtc.getTime() / 1000);
  const windowEnd = Math.floor((todayUtc.getTime() + 3 * MS_PER_DAY) / 1000);

  let trialRows: Array<{ userId: string; trialEnd: number }>;
  try {
    const result = await db.execute(sql`
      SELECT ub.user_id AS "userId", s.trial_end AS "trialEnd"
      FROM stripe.subscriptions s
      JOIN user_billing ub ON ub.stripe_customer_id = s.customer
      WHERE s.status = 'trialing'
        AND s.cancel_at_period_end = false
        AND s.cancel_at IS NULL
        AND s.livemode = ${process.env.NODE_ENV === "production"}
        AND s.trial_end IS NOT NULL
        AND s.trial_end >= ${windowStart}
        AND s.trial_end < ${windowEnd}
    `);
    trialRows = result.rows as typeof trialRows;
  } catch {
    // stripe schema doesn't exist yet
    trialRows = [];
  }

  const dryRunResults: TrialReminderDryRunResult[] = [];
  let trialRemindersSent = 0;
  let trialRemindersFailed = 0;

  for (const row of trialRows) {
    const trialEndDate = new Date(row.trialEnd * 1000);

    if (dryRun) {
      // Check whether the reminder has already been sent (without writing anything).
      const billingRows = await db
        .select({ trialReminderSentAt: userBillingTable.trialReminderSentAt })
        .from(userBillingTable)
        .where(eq(userBillingTable.userId, row.userId))
        .limit(1);
      const alreadySent = (billingRows[0]?.trialReminderSentAt ?? null) !== null;

      logger.info(
        { userId: row.userId, trialEnd: trialEndDate.toISOString(), alreadySent },
        "Trial reminder dry-run: would send email",
      );

      dryRunResults.push({
        userId: row.userId,
        trialEnd: trialEndDate.toISOString(),
        alreadySent,
      });
      continue;
    }

    // Atomically claim the send slot — only one process wins when trial_reminder_sent_at IS NULL.
    // This prevents duplicate sends in concurrent sweep runs (e.g. multi-instance or rapid restarts).
    const claimed = await db
      .update(userBillingTable)
      .set({ trialReminderSentAt: new Date() })
      .where(
        and(
          eq(userBillingTable.userId, row.userId),
          isNull(userBillingTable.trialReminderSentAt),
        ),
      )
      .returning({ userId: userBillingTable.userId });

    if (claimed.length === 0) continue; // already claimed by a previous run or concurrent process

    // Send the email now that we've claimed the slot.
    const sent = await sendTrialEndingEmail(row.userId, trialEndDate);

    if (sent) {
      trialRemindersSent++;
    } else {
      trialRemindersFailed++;
      // Reset the flag so the next nightly sweep can retry.
      await db
        .update(userBillingTable)
        .set({ trialReminderSentAt: null })
        .where(eq(userBillingTable.userId, row.userId));
      logger.warn({ userId: row.userId }, "Trial reminder email failed — flag reset for retry");
    }
  }

  if (!dryRun) {
    if (trialRemindersSent > 0) {
      logger.info({ trialRemindersSent }, "Trial ending reminder emails dispatched");
    }
    if (trialRemindersFailed > 0) {
      logger.warn({ trialRemindersFailed }, "Trial ending reminder emails failed (will retry next sweep)");
    }
  }

  return dryRunResults;
}

/**
 * Nightly sweep: send return-window reminder emails at 7 days and 2 days before deadline.
 * Skips users who have opted out of notifications.
 * Uses optimistic atomic updates (claim-before-send) to prevent duplicate sends.
 * Only for users with current access (see reminderAccessChecker); a trial at
 * the receipt cap still gets alerts.
 * Exported for tests; runs daily from runDailyMaintenance.
 */
export async function runReturnWindowSweep(): Promise<void> {
  // Load all completed non-draft receipts that are online purchases and have
  // at least one reminder not yet sent.
  let receipts: Array<{
    id: number;
    userId: string;
    merchant: string | null;
    notableItems: ReceiptNotableItem[];
    purchaseDate: string | null;
    purchaseCountry: string | null;
    isOnlinePurchase: boolean | null;
    deliveryDate: string | null;
    currency: string | null;
    originalFileName: string;
    returnReminderSent7dAt: Date | null;
    returnReminderSent2dAt: Date | null;
    returnPushSent2dAt: Date | null;
    returnPushSent1dAt: Date | null;
  }>;

  try {
    receipts = await db
      .select({
        id: receiptsTable.id,
        userId: receiptsTable.userId,
        merchant: receiptsTable.merchant,
        notableItems: receiptsTable.notableItems,
        purchaseDate: receiptsTable.purchaseDate,
        purchaseCountry: receiptsTable.purchaseCountry,
        isOnlinePurchase: receiptsTable.isOnlinePurchase,
        deliveryDate: receiptsTable.deliveryDate,
        currency: receiptsTable.currency,
        originalFileName: receiptsTable.originalFileName,
        returnReminderSent7dAt: receiptsTable.returnReminderSent7dAt,
        returnReminderSent2dAt: receiptsTable.returnReminderSent2dAt,
        returnPushSent2dAt: receiptsTable.returnPushSent2dAt,
        returnPushSent1dAt: receiptsTable.returnPushSent1dAt,
      })
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.status, "completed"),
          eq(receiptsTable.isDraft, false),
        ),
      );
  } catch (err) {
    logger.error({ err }, "Return window sweep: failed to query receipts");
    return;
  }

  // Cache opt-out status per userId to avoid repeated DB lookups.
  const optOutCache = new Map<string, boolean>();
  async function isOptedOut(userId: string): Promise<boolean> {
    if (optOutCache.has(userId)) return optOutCache.get(userId)!;
    const [row] = await db
      .select({ notificationsOptOut: userPreferencesTable.notificationsOptOut })
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId))
      .limit(1);
    const optOut = row?.notificationsOptOut ?? false;
    optOutCache.set(userId, optOut);
    return optOut;
  }

  let sent7d = 0;
  let sent2d = 0;
  let skippedExpired = 0;
  let skippedOptOut = 0;
  let skippedNoAccess = 0;
  const hasAccess = reminderAccessChecker();

  for (const r of receipts) {
    if (!r.purchaseDate) continue;

    const window = calcReturnWindow({
      purchaseDate: r.purchaseDate,
      deliveryDate: r.deliveryDate,
      purchaseCountry: r.purchaseCountry,
      isOnlinePurchase: r.isOnlinePurchase,
      currency: r.currency,
      merchant: r.merchant,
    });

    if (!window) continue;
    const { deadlineDate, daysRemaining } = window;

    // Skip already expired windows
    if (daysRemaining < 0) {
      skippedExpired++;
      continue;
    }

    const needs2d = r.returnReminderSent2dAt === null && daysRemaining <= 2;
    // If both are due in one run (receipt added late or a missed day), send
    // only the more urgent 2-day email; the 2-day claim also marks the 7-day one.
    const needs7d = r.returnReminderSent7dAt === null && daysRemaining <= 7 && !needs2d;
    const needsPush2d = r.returnPushSent2dAt === null && daysRemaining <= 2;
    const needsPush1d = r.returnPushSent1dAt === null && daysRemaining <= 1;

    if (!needs7d && !needs2d && !needsPush2d && !needsPush1d) continue;
    if (!(await hasAccess(r.userId))) {
      skippedNoAccess++;
      continue;
    }

    // Email reminders respect the existing email opt-out. Browser push is
    // managed independently by adding/removing the device subscription.
    const optedOut = await isOptedOut(r.userId);
    if (optedOut && (needs7d || needs2d)) {
      skippedOptOut++;
    }

    const notableItemName = r.notableItems?.[0]?.name ?? null;

    // --- 7-day alert ---
    if (needs7d && !optedOut) {
      // Atomically claim the send slot
      const claimed = await db
        .update(receiptsTable)
        .set({ returnReminderSent7dAt: new Date() })
        .where(
          and(
            eq(receiptsTable.id, r.id),
            isNull(receiptsTable.returnReminderSent7dAt),
          ),
        )
        .returning({ id: receiptsTable.id });

      if (claimed.length > 0) {
        const ok = await sendReturnWindowEmail(r.userId, {
          id: r.id,
          merchant: r.merchant,
          notableItemName,
          deadlineDate,
          daysRemaining,
          originalFileName: r.originalFileName,
        });
        if (ok) {
          sent7d++;
        } else {
          // Reset flag so the next sweep can retry
          await db
            .update(receiptsTable)
            .set({ returnReminderSent7dAt: null })
            .where(eq(receiptsTable.id, r.id));
        }
      }
    }

    // --- 2-day alert ---
    if (needs2d && !optedOut) {
      const claimedAt = new Date();
      const claimed = await db
        .update(receiptsTable)
        .set({ returnReminderSent2dAt: claimedAt, returnReminderSent7dAt: r.returnReminderSent7dAt ?? claimedAt })
        .where(
          and(
            eq(receiptsTable.id, r.id),
            isNull(receiptsTable.returnReminderSent2dAt),
          ),
        )
        .returning({ id: receiptsTable.id });

      if (claimed.length > 0) {
        const ok = await sendReturnWindowEmail(r.userId, {
          id: r.id,
          merchant: r.merchant,
          notableItemName,
          deadlineDate,
          daysRemaining,
          originalFileName: r.originalFileName,
        });
        if (ok) {
          sent2d++;
        } else {
          await db
            .update(receiptsTable)
            .set({ returnReminderSent2dAt: null, returnReminderSent7dAt: r.returnReminderSent7dAt })
            .where(eq(receiptsTable.id, r.id));
        }
      }
    }

    // --- 2-day and 1-day push alerts ---
    // Push delivery has its own deduplication markers so email preferences do
    // not accidentally suppress browser notifications.
    const shouldSendPush = needsPush1d || needsPush2d;
    const pushField = needsPush1d
      ? receiptsTable.returnPushSent1dAt
      : receiptsTable.returnPushSent2dAt;
    if (shouldSendPush) {
      const claimed = await db
        .update(receiptsTable)
        .set(needsPush1d
          ? { returnPushSent1dAt: new Date() }
          : { returnPushSent2dAt: new Date() })
        .where(and(eq(receiptsTable.id, r.id), isNull(pushField)))
        .returning({ id: receiptsTable.id });

      if (claimed.length > 0) {
        const sent = await sendPushNotification(r.userId, {
          title: "Return window closing soon",
          body: `${notableItemName || r.merchant || "Your purchase"} · closes ${deadlineDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}`,
          receiptId: r.id,
        });
        if (!sent) {
          await db
            .update(receiptsTable)
            .set(needsPush1d
              ? { returnPushSent1dAt: null }
              : { returnPushSent2dAt: null })
            .where(eq(receiptsTable.id, r.id));
        }
      }
    }
  }

  logger.info(
    { sent7d, sent2d, skippedExpired, skippedOptOut, skippedNoAccess },
    "Return window sweep complete",
  );
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export const DAILY_MAINTENANCE_JOB = "daily-maintenance";
/** A little under 24h so the run time doesn't drift later every day. */
export const DAILY_MAINTENANCE_MIN_INTERVAL_MS = 23 * 60 * 60 * 1000;
const SCHEDULER_TICK_MS = 60 * 60 * 1000;

/**
 * Run daily maintenance only if no process started it in the last ~23h.
 * Restarts and autoscale instances check hourly; the DB lock lets one win.
 */
export async function runDailyMaintenanceIfDue(now = new Date()): Promise<boolean> {
  try {
    if (!(await claimScheduledRun(DAILY_MAINTENANCE_JOB, DAILY_MAINTENANCE_MIN_INTERVAL_MS, now))) return false;
  } catch (err) {
    logger.error({ err }, "Daily maintenance: could not claim run lock; skipping");
    return false;
  }
  await runDailyMaintenance();
  return true;
}

export function startOrphanCleanupScheduler(): void {
  if (cleanupTimer) return;

  void runDailyMaintenanceIfDue();

  cleanupTimer = setInterval(() => {
    void runDailyMaintenanceIfDue();
  }, SCHEDULER_TICK_MS);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  logger.info(
    { tickMs: SCHEDULER_TICK_MS, minIntervalMs: DAILY_MAINTENANCE_MIN_INTERVAL_MS, thresholdDays: ORPHAN_AGE_THRESHOLD_DAYS },
    "Orphan cleanup scheduler started",
  );
}

export function stopOrphanCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
