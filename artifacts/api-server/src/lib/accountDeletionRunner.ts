import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  accountDeletionRequestsTable,
  emailConnectionsTable,
  gmailConnectionsTable,
  gmailSeenMessagesTable,
  legalAcceptancesTable,
  pendingImportsTable,
  pushSubscriptionsTable,
  receiptAttachmentsTable,
  receiptsTable,
  uploadIntentsTable,
  userBillingTable,
  accountTrialsTable,
  trialUploadsTable,
  trialFunnelSubjectsTable,
  userPreferencesTable,
} from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";
import { getSubscriptionStatus } from "./subscriptionStatus";
import { getUncachableStripeClient } from "../stripeClient";
import { logger, gmailLogger } from "./logger";
import { revokeGmailAccess } from "./gmailSync";
import { cancelSubscriptionForDeletion, deleteAccountObjects } from "./accountDeletion";
import { withUserDataLock } from "./userDataLock";

const objectStorageService = new ObjectStorageService();

export interface DeletionOutcome {
  status: number;
  body?: Record<string, unknown>;
}

export interface DeletionOptions {
  /**
   * true for a user-requested deletion (cancel any known Stripe subscription
   * first). The inactive-account sweep passes false: it only runs for accounts
   * without access, and never calls Stripe.
   */
  cancelSubscription: boolean;
}

/**
 * Delete everything Receebo holds for a user: files, receipts, extracted data,
 * email connections (Outlook/Gmail), preferences, trial/billing rows and the
 * sign-in account. Stripe keeps the invoice/payment records the law requires.
 * Shared by DELETE /account and the 60-day inactive-account deletion.
 * Resumable: every stage is recorded in account_deletion_requests.
 */
export async function performAccountDeletion(
  userId: string,
  options: DeletionOptions,
): Promise<DeletionOutcome> {
  let deletionStage:
    | "not_started"
    | "files_deleted"
    | "subscription_cancelled"
    | "database_deleted" = "not_started";

  try {
    return await withUserDataLock(userId, async (): Promise<DeletionOutcome> => {
      const [activeUploadIntent] = await db
        .select({ expiresAt: uploadIntentsTable.expiresAt })
        .from(uploadIntentsTable)
        .where(
          and(
            eq(uploadIntentsTable.userId, userId),
            gt(uploadIntentsTable.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(uploadIntentsTable.expiresAt))
        .limit(1);

      if (activeUploadIntent) {
        return {
          status: 409,
          body: {
            error:
              "A recent upload link is still active. No subscription, files, or account data were changed. Retry deletion after it expires.",
            partial: false,
            retryable: true,
            stage: "awaiting_upload_expiry",
            retryAfter: activeUploadIntent.expiresAt.toISOString(),
          },
        };
      }

      await db
        .insert(accountDeletionRequestsTable)
        .values({ userId, stage: "requested" })
        .onConflictDoUpdate({
          target: accountDeletionRequestsTable.userId,
          set: { stage: "requested", lastError: null, updatedAt: new Date() },
        });

      if (options.cancelSubscription) {
        const [billing] = await db
          .select()
          .from(userBillingTable)
          .where(eq(userBillingTable.userId, userId))
          .limit(1);

        let subscription;
        try {
          subscription = await getSubscriptionStatus(userId);
        } catch (err) {
          await db
            .update(accountDeletionRequestsTable)
            .set({ lastError: "Could not verify subscription status", updatedAt: new Date() })
            .where(eq(accountDeletionRequestsTable.userId, userId));
          throw err;
        }
        const stripeSubscriptionId =
          subscription.stripeSubscriptionId ?? billing?.stripeSubscriptionId;

        if (stripeSubscriptionId) {
          try {
            const stripe = await getUncachableStripeClient();
            await cancelSubscriptionForDeletion(
              stripeSubscriptionId,
              (subscriptionId) => stripe.subscriptions.cancel(subscriptionId),
            );
          } catch (err) {
            await db
              .update(accountDeletionRequestsTable)
              .set({ lastError: "Could not cancel Stripe subscription", updatedAt: new Date() })
              .where(eq(accountDeletionRequestsTable.userId, userId));
            logger.error(
              { err, userId, stripeSubscriptionId },
              "Could not cancel Stripe subscription before account deletion",
            );
            return {
              status: 502,
              body: {
                error:
                  "We could not cancel your subscription. No files or account data were deleted. Please try again or contact contact@receebo.net.",
                partial: false,
                retryable: true,
                stage: "requested",
              },
            };
          }
        }
      }
      deletionStage = "subscription_cancelled";
      await db
        .update(accountDeletionRequestsTable)
        .set({ stage: deletionStage, lastError: null, updatedAt: new Date() })
        .where(eq(accountDeletionRequestsTable.userId, userId));

      const objectPaths = await listAccountObjectPaths(userId);
      const failedPaths = await deleteAccountObjects(
        objectPaths,
        (objectPath) => objectStorageService.deleteObject(objectPath),
        (err) => err instanceof ObjectNotFoundError,
        (objectPath, err) => {
          logger.warn({ err, userId, objectPath }, "Storage cleanup failed during account deletion");
        },
      );

      if (failedPaths.length > 0) {
        await db
          .update(accountDeletionRequestsTable)
          .set({
            stage: "storage_partial",
            lastError: `Could not remove ${failedPaths.length} object(s)`,
            updatedAt: new Date(),
          })
          .where(eq(accountDeletionRequestsTable.userId, userId));
        return {
          status: 503,
          body: {
            error:
              "Your subscription was cancelled, but some files could not be removed. Your account remains available and deletion can be safely retried. Contact contact@receebo.net if the problem continues.",
            partial: true,
            retryable: true,
            stage: "storage_partial",
          },
        };
      }
      deletionStage = "files_deleted";
      await db
        .update(accountDeletionRequestsTable)
        .set({ stage: deletionStage, lastError: null, updatedAt: new Date() })
        .where(eq(accountDeletionRequestsTable.userId, userId));

      const [gmailConnection] = await db
        .select()
        .from(gmailConnectionsTable)
        .where(eq(gmailConnectionsTable.userId, userId))
        .limit(1);

      if (gmailConnection) {
        try {
          await revokeGmailAccess(gmailConnection);
        } catch (err) {
          gmailLogger.warn(
            { err, userId },
            "Gmail token revocation failed during account deletion; continuing local deletion",
          );
        }
      }

      await db.transaction(async (tx) => {
        await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
        await tx.delete(pendingImportsTable).where(eq(pendingImportsTable.userId, userId));
        await tx.delete(gmailSeenMessagesTable).where(eq(gmailSeenMessagesTable.userId, userId));
        await tx.delete(gmailConnectionsTable).where(eq(gmailConnectionsTable.userId, userId));
        // Outlook (and future providers): Microsoft has no per-app token revoke,
        // deleting the stored tokens ends access.
        await tx.delete(emailConnectionsTable).where(eq(emailConnectionsTable.userId, userId));
        await tx.delete(uploadIntentsTable).where(eq(uploadIntentsTable.userId, userId));
        await tx.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
        await tx.delete(legalAcceptancesTable).where(eq(legalAcceptancesTable.userId, userId));
        await tx.delete(receiptsTable).where(eq(receiptsTable.userId, userId));
        await tx.delete(trialUploadsTable).where(eq(trialUploadsTable.userId, userId));
        await tx.delete(accountTrialsTable).where(eq(accountTrialsTable.userId, userId));
        await tx.delete(trialFunnelSubjectsTable).where(eq(trialFunnelSubjectsTable.userId, userId));
        await tx.delete(userBillingTable).where(eq(userBillingTable.userId, userId));
        await tx.execute(sql`DELETE FROM trial_ai_reads WHERE user_id = ${userId}`);
      });
      deletionStage = "database_deleted";
      // Best effort, outside the transaction: these tables come from startup
      // migrations and hold no personal content (code hash, schedule dates).
      for (const statement of [
        sql`DELETE FROM account_deletion_codes WHERE user_id = ${userId}`,
        sql`DELETE FROM account_lifecycle WHERE user_id = ${userId}`,
      ]) {
        try { await db.execute(statement); } catch (err) { logger.warn({ err, userId }, "Account deletion: auxiliary cleanup skipped"); }
      }
      await db
        .update(accountDeletionRequestsTable)
        .set({ stage: deletionStage, lastError: null, updatedAt: new Date() })
        .where(eq(accountDeletionRequestsTable.userId, userId));

      try {
        await clerkClient.users.deleteUser(userId);
      } catch (err) {
        logger.error({ err, userId }, "App data deleted but Clerk account deletion failed");
        return {
          status: 500,
          body: {
            error:
              "Your Receebo data was deleted, but the sign-in account could not be removed automatically. Contact contact@receebo.net to finish the request.",
          },
        };
      }

      await db
        .update(accountDeletionRequestsTable)
        .set({ stage: "completed", lastError: null, updatedAt: new Date() })
        .where(eq(accountDeletionRequestsTable.userId, userId));
      logger.info({ userId }, "Account and user data deleted");
      return { status: 204 };
    });
  } catch (err) {
    logger.error({ err, userId, deletionStage }, "Account deletion failed");
    const [deletionRequest] = await db
      .select({ stage: accountDeletionRequestsTable.stage })
      .from(accountDeletionRequestsTable)
      .where(eq(accountDeletionRequestsTable.userId, userId))
      .limit(1);
    if (deletionRequest?.stage !== "database_deleted") {
      await db
        .update(accountDeletionRequestsTable)
        .set({
          stage: "retryable_failure",
          lastError: err instanceof Error ? err.message : "Deletion failed",
          updatedAt: new Date(),
        })
        .where(eq(accountDeletionRequestsTable.userId, userId));
    }
    if (deletionStage === "not_started") {
      return {
        status: 500,
        body: {
          error: "Account deletion failed before any data was removed. Please try again.",
          partial: false,
          retryable: true,
          stage: deletionStage,
        },
      };
    }
    return {
      status: 500,
      body: {
        error:
          "Account deletion was only partially completed. It is safe to retry, or contact contact@receebo.net for help.",
        partial: true,
        retryable: true,
        stage: deletionStage,
      },
    };
  }
}

/** Every stored object (receipts, attachments, pending imports, upload intents). */
export async function listAccountObjectPaths(userId: string): Promise<string[]> {
  const receipts = await db
    .select({ id: receiptsTable.id, objectPath: receiptsTable.objectPath })
    .from(receiptsTable)
    .where(eq(receiptsTable.userId, userId));
  const receiptIds = receipts.map((receipt) => receipt.id);
  const attachments =
    receiptIds.length > 0
      ? await db
          .select({ objectPath: receiptAttachmentsTable.objectPath })
          .from(receiptAttachmentsTable)
          .where(inArray(receiptAttachmentsTable.receiptId, receiptIds))
      : [];
  const pendingImports = await db
    .select({ objectPath: pendingImportsTable.objectPath })
    .from(pendingImportsTable)
    .where(eq(pendingImportsTable.userId, userId));
  const uploadIntents = await db
    .select({ objectPath: uploadIntentsTable.objectPath })
    .from(uploadIntentsTable)
    .where(eq(uploadIntentsTable.userId, userId));
  return [
    ...receipts.map((row) => row.objectPath),
    ...attachments.map((row) => row.objectPath),
    ...pendingImports.map((row) => row.objectPath),
    ...uploadIntents.map((row) => row.objectPath),
  ].filter(Boolean);
}
