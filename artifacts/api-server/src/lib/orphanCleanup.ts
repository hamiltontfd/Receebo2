import type { File as GCSFile } from "@google-cloud/storage";
import { db, receiptsTable, receiptAttachmentsTable, userBillingTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";
import { sendWarrantyReminderEmail, sendTrialEndingEmail } from "./emailService";

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

    for (const r of warrantyReceipts) {
      if (!r.warranty) continue;
      const matches = r.warranty.match(ISO_DATE_RE);
      if (!matches) continue;

      for (const dateStr of matches) {
        const expiryMs = new Date(`${dateStr}T00:00:00Z`).getTime();
        if (expiryMs === targetMs) {
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
  } catch (err) {
    logger.error({ err }, "Warranty reminder sweep failed");
  }

  // Trial ending reminders — send once when trial_end is within 3 days (once per subscription)
  try {
    await runTrialReminderSweep({ dryRun: false });
  } catch (err) {
    logger.error({ err }, "Trial reminder sweep failed");
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
