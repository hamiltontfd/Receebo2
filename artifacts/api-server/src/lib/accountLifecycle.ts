/**
 * Frozen accounts and data deletion (spec: docs/account-lifecycle.md).
 *
 * - Access ends when a no-card trial ends unpaid or a paid plan lapses. The
 *   account is then frozen: no new receipts, imports or alerts, and no in-app
 *   export (copies on request to contact@receebo.net).
 * - 60 days after access ended, everything is deleted (account, receipts,
 *   files, extracted data, Outlook connection) except the billing records
 *   Stripe must keep. Subscribing before then cancels the deletion.
 * - Trial ended unpaid: a "thanks for trying" email with a smile rating, once,
 *   up to 3 days after the trial ended (cron catch-up).
 * - Warnings 30 and 7 days before, and a confirmation after deletion
 *   (lifecycle emails, marketing copy 2 Nov 2026: lifecycleEmails.ts).
 * - SAFETY: nothing is sent or deleted unless DATA_DELETION_ENABLED=true.
 *   Otherwise the daily sweep only logs a dry run of what it would do.
 */
import { db, accountLifecycleTable, accountDeletionRequestsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getSubscriptionStatus } from "./subscriptionStatus";
import type { DeletionWarningStage } from "./emailService";
import {
  captureDeletionConfirmation,
  sendAccountDeletedEmail,
  sendDeletionWarningEmail,
  sendTrialEndedEmail,
} from "./lifecycleEmails";
import { hasLifecycleSend } from "./lifecycleEmailStore";
import { listAccountObjectPaths, performAccountDeletion } from "./accountDeletionRunner";
import {
  DAY_MS, FINAL_WARNING_DAYS, accessEndedAt, dataDeletionEnabled, deletionDueAt, isFrozen, nextLifecycleAction,
} from "./accountLifecycleSchedule";

export * from "./accountLifecycleSchedule";

/** trial_ended goes out at most this many days after the trial ended (cron catch-up). */
export const TRIAL_ENDED_MAX_LATE_DAYS = 3;

/** Trial ended without ever having had a paid plan, recently enough to say "ended today". */
export function trialEndedEmailDue(
  status: { accessState?: string; stripeSubscriptionId: string | null; trialEndAt: Date | null },
  now: Date,
): boolean {
  if (status.accessState !== "trial_expired" || status.stripeSubscriptionId || !status.trialEndAt) return false;
  const late = now.getTime() - status.trialEndAt.getTime();
  return late >= 0 && late <= TRIAL_ENDED_MAX_LATE_DAYS * DAY_MS;
}


async function countUserData(userId: string) {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM receipts WHERE user_id = ${userId} AND is_draft = false) AS receipts,
      (SELECT count(*)::int FROM email_connections WHERE user_id = ${userId}) AS "emailConnections",
      (SELECT count(*)::int FROM gmail_connections WHERE user_id = ${userId}) AS "gmailConnections"`);
  const row = result.rows[0] as { receipts: number; emailConnections: number; gmailConnections: number };
  const files = (await listAccountObjectPaths(userId)).length;
  return { ...row, files };
}

export interface RetentionSweepResult {
  enabled: boolean;
  frozen: number;
  cancelled: number;
  warned: number;
  trialEnded: number;
  dryRunTrialEnded: number;
  deleted: number;
  dryRunWarnings: number;
  dryRunDeletions: number;
  failed: number;
}

/**
 * Daily: track frozen accounts, send due warnings, delete due accounts.
 * With DATA_DELETION_ENABLED off (default) it records the schedule and logs a
 * dry run only: no email, no deletion.
 */
export async function runDataRetentionSweep(
  options: { now?: Date; enabled?: boolean; userIds?: string[] } = {},
): Promise<RetentionSweepResult> {
  const now = options.now ?? new Date();
  const enabled = options.enabled ?? dataDeletionEnabled();
  const result: RetentionSweepResult = {
    enabled, frozen: 0, cancelled: 0, warned: 0, trialEnded: 0, dryRunTrialEnded: 0, deleted: 0, dryRunWarnings: 0, dryRunDeletions: 0, failed: 0,
  };

  const userIds = options.userIds ?? ((await db.execute(sql`
    SELECT user_id FROM account_trials
    UNION SELECT user_id FROM user_billing
    UNION SELECT user_id FROM account_lifecycle`)).rows as Array<{ user_id: string }>).map((r) => r.user_id);

  for (const userId of userIds) {
    try {
      const [deleting] = await db.select({ stage: accountDeletionRequestsTable.stage })
        .from(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.userId, userId));
      if (deleting) continue; // a deletion is already under way or done

      const status = await getSubscriptionStatus(userId);
      if (!isFrozen(status)) {
        const removed = await db.delete(accountLifecycleTable)
          .where(eq(accountLifecycleTable.userId, userId)).returning({ userId: accountLifecycleTable.userId });
        if (removed.length > 0) {
          result.cancelled++;
          logger.info({ userId, accessState: status.accessState }, "Data retention: access restored, deletion cancelled");
        }
        continue;
      }
      result.frozen++;
      const ended = accessEndedAt(status, now);
      await db.insert(accountLifecycleTable)
        .values({ userId, accessEndedAt: ended, deletionDueAt: deletionDueAt(ended, now) })
        .onConflictDoNothing();
      const [row] = await db.select().from(accountLifecycleTable).where(eq(accountLifecycleTable.userId, userId));
      if (!row) continue;

      // Trial over without a subscription: once per account, never after a paid plan.
      // Same safety switch as the deletion emails (its copy announces the deletion date).
      if (trialEndedEmailDue(status, now) && !(await hasLifecycleSend(userId, "trial_ended"))) {
        if (!enabled) {
          result.dryRunTrialEnded++;
          logger.info({ userId, deletionDueAt: row.deletionDueAt },
            "Data retention DRY RUN: would send trial_ended email (DATA_DELETION_ENABLED is off)");
        } else if (await sendTrialEndedEmail(userId, { deletionDate: row.deletionDueAt })) {
          result.trialEnded++;
        } else {
          result.failed++;
        }
      }

      const action = nextLifecycleAction(row, now);
      if (action.kind === "none") continue;

      if (action.kind === "postpone_delete") {
        logger.warn({ userId, reason: action.reason, deletionDueAt: row.deletionDueAt }, "Data retention: deletion postponed");
        if (!enabled) result.dryRunDeletions++;
        continue;
      }

      if (action.kind === "reschedule_and_warn") {
        if (!enabled) {
          result.dryRunDeletions++;
          logger.info({ userId, deletionDueAt: row.deletionDueAt },
            "Data retention DRY RUN: due for deletion, but the final warning was never sent; would move the date 7 days out and warn (DATA_DELETION_ENABLED is off)");
          continue;
        }
        const newDue = new Date(now.getTime() + FINAL_WARNING_DAYS * DAY_MS);
        await db.update(accountLifecycleTable).set({ deletionDueAt: newDue })
          .where(eq(accountLifecycleTable.userId, userId));
        row.deletionDueAt = newDue;
        logger.info({ userId, deletionDueAt: newDue }, "Data retention: final warning missing, deletion moved 7 days out");
      }

      if (action.kind === "warn" || action.kind === "reschedule_and_warn") {
        const stage: DeletionWarningStage = action.kind === "warn" ? action.stage : "7d";
        const counts = await countUserData(userId);
        if (!enabled) {
          result.dryRunWarnings++;
          logger.info({ userId, stage, deletionDueAt: row.deletionDueAt, receipts: counts.receipts },
            "Data retention DRY RUN: would send deletion warning (DATA_DELETION_ENABLED is off)");
          continue;
        }
        // Claim before sending so concurrent sweeps never double-send.
        const column = stage === "7d" ? accountLifecycleTable.warning7SentAt : accountLifecycleTable.warning30SentAt;
        const claimed = await db.update(accountLifecycleTable)
          .set(stage === "7d"
            ? { warning7SentAt: now, warning30SentAt: row.warning30SentAt ?? now }
            : { warning30SentAt: now })
          .where(sql`${accountLifecycleTable.userId} = ${userId} AND ${column} IS NULL`)
          .returning({ userId: accountLifecycleTable.userId });
        if (claimed.length === 0) continue;
        let ok = false;
        try {
          ok = await sendDeletionWarningEmail(userId, { stage, deletionDate: row.deletionDueAt });
        } finally {
          // Locale/contact reads can throw before delivery. A claim is not proof
          // of delivery: restore it on BOTH rejection and false, or a later sweep
          // could delete the account without its mandatory final warning.
          if (!ok) {
            await db.update(accountLifecycleTable)
              .set({ warning30SentAt: row.warning30SentAt, warning7SentAt: row.warning7SentAt })
              .where(sql`${accountLifecycleTable.userId} = ${userId} AND ${column} = ${now}`);
          }
        }
        if (ok) {
          result.warned++;
        } else {
          result.failed++;
        }
        continue;
      }

      // action.kind === "delete"
      const counts = await countUserData(userId);
      if (!enabled) {
        result.dryRunDeletions++;
        logger.info({ userId, deletionDueAt: row.deletionDueAt, ...counts },
          "Data retention DRY RUN: would delete account, receipts, files and email connections (DATA_DELETION_ENABLED is off)");
        continue;
      }
      // Address, name, language, date format and receipt count: all gone after deletion.
      const contact = await captureDeletionConfirmation(userId, row.deletionDueAt);
      const outcome = await performAccountDeletion(userId, { cancelSubscription: false });
      if (outcome.status !== 204) {
        result.failed++;
        logger.error({ userId, status: outcome.status, body: outcome.body }, "Data retention: deletion failed, will retry");
        continue;
      }
      await db.delete(accountLifecycleTable).where(eq(accountLifecycleTable.userId, userId));
      result.deleted++;
      logger.info({ userId, ...counts }, "Data retention: inactive account deleted");
      if (contact) await sendAccountDeletedEmail(userId, contact, "inactive");
    } catch (err) {
      result.failed++;
      logger.error({ err, userId }, "Data retention: account failed, continuing");
    }
  }

  if (result.frozen || result.cancelled || result.failed) {
    logger.info(result, "Data retention sweep complete");
  }
  return result;
}
