import type { File as GCSFile } from "@google-cloud/storage";
import { db, receiptsTable, receiptAttachmentsTable, userBillingTable, userPreferencesTable, type ReceiptNotableItem } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";
import { sendWarrantyReminderEmail, sendTrialEndingEmail, sendReturnWindowEmail } from "./emailService";
import { sendPushNotification } from "./pushNotifications";
import { calcReturnWindow } from "./returnWindowCalc";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
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

async function runOrphanCleanup(): Promise<void> {
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
    knownPaths = new Set([
      ...receiptRows.map((r) => r.objectPath),
      ...attachmentRows.map((a) => a.objectPath),
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

  // Warranty expiry reminders — send once when expiry is 28-30 days away
  try {
    const warrantyReceipts = await db
      .select({
        id: receiptsTable.id,
        userId: receiptsTable.userId,
        merchant: receiptsTable.merchant,
        warranty: receiptsTable.warranty,
        originalFileName: receiptsTable.originalFileName,
      })
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.status, "completed"),
          isNotNull(receiptsTable.warranty),
        ),
      );

    const MS_PER_DAY = 86_400_000;
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const targetMs = todayUtc.getTime() + 30 * MS_PER_DAY;

    const ISO_DATE_RE = /(\d{4}-\d{2}-\d{2})/g;
    let remindersSent = 0;
    let remindersSkippedOptOut = 0;

    // Cache opt-out status per user to avoid repeated lookups
    const warrantyOptOutCache = new Map<string, boolean>();
    async function isWarrantyOptedOut(userId: string): Promise<boolean> {
      if (warrantyOptOutCache.has(userId)) return warrantyOptOutCache.get(userId)!;
      const [row] = await db
        .select({ notificationsOptOut: userPreferencesTable.notificationsOptOut })
        .from(userPreferencesTable)
        .where(eq(userPreferencesTable.userId, userId))
        .limit(1);
      const optOut = row?.notificationsOptOut ?? false;
      warrantyOptOutCache.set(userId, optOut);
      return optOut;
    }

    for (const r of warrantyReceipts) {
      if (!r.warranty) continue;
      const matches = r.warranty.match(ISO_DATE_RE);
      if (!matches) continue;

      for (const dateStr of matches) {
        const expiryMs = new Date(`${dateStr}T00:00:00Z`).getTime();
        if (expiryMs === targetMs) {
          if (await isWarrantyOptedOut(r.userId)) {
            remindersSkippedOptOut++;
            break;
          }
          void sendWarrantyReminderEmail(r.userId, {
            id: r.id,
            merchant: r.merchant,
            warranty: r.warranty,
            originalFileName: r.originalFileName,
          });
          remindersSent++;
          break;
        }
      }
    }

    if (remindersSent > 0) {
      logger.info({ remindersSent }, "Warranty reminder emails dispatched");
    }
    if (remindersSkippedOptOut > 0) {
      logger.info({ remindersSkippedOptOut }, "Warranty reminders skipped (opt-out)");
    }
  } catch (err) {
    logger.error({ err }, "Warranty reminder sweep failed");
  }

  // Trial ending reminders — send once when trial_end is within 3 days (once per subscription)
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
 */
async function runReturnWindowSweep(): Promise<void> {
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

  for (const r of receipts) {
    if (!r.purchaseDate) continue;

    const window = calcReturnWindow({
      purchaseDate: r.purchaseDate,
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

    const needs7d = r.returnReminderSent7dAt === null && daysRemaining <= 7;
    const needs2d = r.returnReminderSent2dAt === null && daysRemaining <= 2;
    const needsPush2d = r.returnPushSent2dAt === null && daysRemaining <= 2;
    const needsPush1d = r.returnPushSent1dAt === null && daysRemaining <= 1;

    if (!needs7d && !needs2d && !needsPush2d && !needsPush1d) continue;

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
      const claimed = await db
        .update(receiptsTable)
        .set({ returnReminderSent2dAt: new Date() })
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
            .set({ returnReminderSent2dAt: null })
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
    { sent7d, sent2d, skippedExpired, skippedOptOut },
    "Return window sweep complete",
  );
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startOrphanCleanupScheduler(): void {
  if (cleanupTimer) return;

  void runOrphanCleanup();

  cleanupTimer = setInterval(() => {
    void runOrphanCleanup();
  }, CLEANUP_INTERVAL_MS);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  logger.info(
    { intervalMs: CLEANUP_INTERVAL_MS, thresholdDays: ORPHAN_AGE_THRESHOLD_DAYS },
    "Orphan cleanup scheduler started",
  );
}

export function stopOrphanCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
