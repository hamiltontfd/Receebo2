import { Router, type IRouter } from "express";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  accountDeletionRequestsTable,
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
  userPreferencesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { getUncachableStripeClient } from "../stripeClient";
import { logger, gmailLogger } from "../lib/logger";
import { revokeGmailAccess } from "../lib/gmailSync";
import {
  cancelSubscriptionForDeletion,
  deleteAccountObjects,
} from "../lib/accountDeletion";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "../lib/legalAcceptance";
import { lockUserDataMutation, withUserDataLock } from "../lib/userDataLock";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.get("/legal/acceptance", requireAuth, async (req, res): Promise<void> => {
  try {
    if (await isAccountDeletionInProgress(req.userId!)) {
      res.json({
        accepted: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: null,
        deletionRecovery: true,
      });
      return;
    }
    const [latest] = await db
      .select()
      .from(legalAcceptancesTable)
      .where(eq(legalAcceptancesTable.userId, req.userId!))
      .orderBy(desc(legalAcceptancesTable.acceptedAt))
      .limit(1);

    res.json({
      accepted:
        latest?.termsVersion === TERMS_VERSION &&
        latest?.privacyVersion === PRIVACY_VERSION &&
        latest?.confirmedAge === true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: latest?.acceptedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, userId: req.userId }, "Failed to load legal acceptance");
    res.status(500).json({ error: "Failed to load legal acceptance" });
  }
});

router.post("/legal/acceptance", requireAuth, lockUserDataMutation(async (req, res): Promise<void> => {
  const { termsVersion, privacyVersion, confirmedAge } = req.body as {
    termsVersion?: unknown;
    privacyVersion?: unknown;
    confirmedAge?: unknown;
  };

  if (
    termsVersion !== TERMS_VERSION ||
    privacyVersion !== PRIVACY_VERSION ||
    confirmedAge !== true
  ) {
    res.status(400).json({
      error: "Current Terms, Privacy Policy, and 18+ confirmation are required",
    });
    return;
  }

  try {
    const [acceptance] = await db
      .insert(legalAcceptancesTable)
      .values({
        userId: req.userId!,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        confirmedAge: true,
      })
      .returning();

    res.status(201).json({
      accepted: true,
      termsVersion: acceptance.termsVersion,
      privacyVersion: acceptance.privacyVersion,
      acceptedAt: acceptance.acceptedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId: req.userId }, "Failed to record legal acceptance");
    res.status(500).json({ error: "Failed to record legal acceptance" });
  }
}));

router.get("/account/export", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  try {
    const user = await clerkClient.users.getUser(userId);
    const receipts = await db
      .select()
      .from(receiptsTable)
      .where(eq(receiptsTable.userId, userId));
    const receiptIds = receipts.map((receipt) => receipt.id);
    const attachments =
      receiptIds.length > 0
        ? await db
            .select()
            .from(receiptAttachmentsTable)
            .where(inArray(receiptAttachmentsTable.receiptId, receiptIds))
        : [];
    const [gmailConnection] = await db
      .select({
        gmailEmail: gmailConnectionsTable.gmailEmail,
        lastSyncedAt: gmailConnectionsTable.lastSyncedAt,
        connectedAt: gmailConnectionsTable.createdAt,
      })
      .from(gmailConnectionsTable)
      .where(eq(gmailConnectionsTable.userId, userId))
      .limit(1);
    const pendingImports = await db
      .select()
      .from(pendingImportsTable)
      .where(eq(pendingImportsTable.userId, userId));
    const [preferences] = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId))
      .limit(1);
    const acceptances = await db
      .select()
      .from(legalAcceptancesTable)
      .where(eq(legalAcceptancesTable.userId, userId))
      .orderBy(desc(legalAcceptancesTable.acceptedAt));
    const pushSubscriptions = await db
      .select({
        endpoint: pushSubscriptionsTable.endpoint,
        createdAt: pushSubscriptionsTable.createdAt,
        updatedAt: pushSubscriptionsTable.updatedAt,
      })
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, userId));
    const [billing] = await db
      .select({
        stripeCustomerId: userBillingTable.stripeCustomerId,
        stripeSubscriptionId: userBillingTable.stripeSubscriptionId,
        createdAt: userBillingTable.createdAt,
        updatedAt: userBillingTable.updatedAt,
      })
      .from(userBillingTable)
      .where(eq(userBillingTable.userId, userId))
      .limit(1);
    const subscription = await getSubscriptionStatus(userId);

    const primaryEmail =
      user.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      )?.emailAddress ?? null;

    const data = {
      exportedAt: new Date().toISOString(),
      account: {
        userId,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
        email: primaryEmail,
        createdAt: user.createdAt
          ? new Date(user.createdAt).toISOString()
          : null,
      },
      subscription: {
        plan: subscription.plan,
        trialEndAt: subscription.trialEndAt?.toISOString() ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        billing,
        note:
          "Stripe may retain payment and invoice records where required by law. Manage invoices in the Stripe billing portal.",
      },
      receipts,
      attachments,
      gmail: {
        connection: gmailConnection ?? null,
        pendingImports,
        note:
          "OAuth access and refresh tokens are excluded from this portable copy for security.",
      },
      preferences: preferences ?? null,
      legalAcceptances: acceptances,
      pushSubscriptions,
      uploadedFiles: {
        note:
          "Receipt images and attachments remain downloadable from their receipt pages while the account is active.",
      },
    };

    const filename = `receebo-data-export-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error({ err, userId }, "Account export failed");
    res.status(500).json({ error: "Failed to prepare account export" });
  }
});

router.delete("/account", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { confirmation } = req.body as { confirmation?: unknown };
  let deletionStage:
    | "not_started"
    | "files_deleted"
    | "subscription_cancelled"
    | "database_deleted" = "not_started";

  if (confirmation !== "DELETE") {
    res.status(400).json({ error: 'Type "DELETE" to confirm account deletion' });
    return;
  }

  try {
    await withUserDataLock(userId, async () => {
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
      res.status(409).json({
        error:
          "A recent upload link is still active. No subscription, files, or account data were changed. Retry deletion after it expires.",
        partial: false,
        retryable: true,
        stage: "awaiting_upload_expiry",
        retryAfter: activeUploadIntent.expiresAt.toISOString(),
      });
      return;
    }

    await db
      .insert(accountDeletionRequestsTable)
      .values({ userId, stage: "requested" })
      .onConflictDoUpdate({
        target: accountDeletionRequestsTable.userId,
        set: {
          stage: "requested",
          lastError: null,
          updatedAt: new Date(),
        },
      });

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
        .set({
          lastError: "Could not verify subscription status",
          updatedAt: new Date(),
        })
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
          .set({
            lastError: "Could not cancel Stripe subscription",
            updatedAt: new Date(),
          })
          .where(eq(accountDeletionRequestsTable.userId, userId));
        logger.error(
          { err, userId, stripeSubscriptionId },
          "Could not cancel Stripe subscription before account deletion",
        );
        res.status(502).json({
          error:
            "We could not cancel your subscription. No files or account data were deleted. Please try again or contact contact@receebo.net.",
          partial: false,
          retryable: true,
          stage: "requested",
        });
        return;
      }
    }
    deletionStage = "subscription_cancelled";
    await db
      .update(accountDeletionRequestsTable)
      .set({
        stage: deletionStage,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequestsTable.userId, userId));

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

    const objectPaths = [
      ...receipts.map((row) => row.objectPath),
      ...attachments.map((row) => row.objectPath),
      ...pendingImports.map((row) => row.objectPath),
      ...uploadIntents.map((row) => row.objectPath),
    ];
    const failedPaths = await deleteAccountObjects(
      objectPaths,
      (objectPath) => objectStorageService.deleteObject(objectPath),
      (err) => err instanceof ObjectNotFoundError,
      (objectPath, err) => {
        logger.warn(
          { err, userId, objectPath },
          "Storage cleanup failed during account deletion",
        );
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
      res.status(503).json({
        error:
          "Your subscription was cancelled, but some files could not be removed. Your account remains available and deletion can be safely retried. Contact contact@receebo.net if the problem continues.",
        partial: true,
        retryable: true,
        stage: "storage_partial",
      });
      return;
    }
    deletionStage = "files_deleted";
    await db
      .update(accountDeletionRequestsTable)
      .set({
        stage: deletionStage,
        lastError: null,
        updatedAt: new Date(),
      })
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
      await tx
        .delete(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.userId, userId));
      await tx
        .delete(pendingImportsTable)
        .where(eq(pendingImportsTable.userId, userId));
      await tx
        .delete(gmailSeenMessagesTable)
        .where(eq(gmailSeenMessagesTable.userId, userId));
      await tx
        .delete(gmailConnectionsTable)
        .where(eq(gmailConnectionsTable.userId, userId));
      await tx
        .delete(uploadIntentsTable)
        .where(eq(uploadIntentsTable.userId, userId));
      await tx
        .delete(userPreferencesTable)
        .where(eq(userPreferencesTable.userId, userId));
      await tx
        .delete(legalAcceptancesTable)
        .where(eq(legalAcceptancesTable.userId, userId));
      await tx.delete(receiptsTable).where(eq(receiptsTable.userId, userId));
      await tx.delete(trialUploadsTable).where(eq(trialUploadsTable.userId, userId));
      await tx.delete(accountTrialsTable).where(eq(accountTrialsTable.userId, userId));
      await tx
        .delete(userBillingTable)
        .where(eq(userBillingTable.userId, userId));
    });
    deletionStage = "database_deleted";
    await db
      .update(accountDeletionRequestsTable)
      .set({
        stage: deletionStage,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequestsTable.userId, userId));

    try {
      await clerkClient.users.deleteUser(userId);
    } catch (err) {
      logger.error(
        { err, userId },
        "App data deleted but Clerk account deletion failed",
      );
      res.status(500).json({
        error:
          "Your Receebo data was deleted, but the sign-in account could not be removed automatically. Contact contact@receebo.net to finish the request.",
      });
      return;
    }

    await db
      .update(accountDeletionRequestsTable)
      .set({
        stage: "completed",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequestsTable.userId, userId));
    logger.info({ userId }, "Account and user data deleted");
    res.status(204).send();
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
      res.status(500).json({
        error: "Account deletion failed before any data was removed. Please try again.",
        partial: false,
        retryable: true,
        stage: deletionStage,
      });
      return;
    }
    res.status(500).json({
      error:
        "Account deletion was only partially completed. It is safe to retry, or contact contact@receebo.net for help.",
      partial: true,
      retryable: true,
      stage: deletionStage,
    });
  }
});

export default router;