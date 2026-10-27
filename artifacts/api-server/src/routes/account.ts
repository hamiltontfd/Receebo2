import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  emailConnectionsTable,
  gmailConnectionsTable,
  legalAcceptancesTable,
  pendingImportsTable,
  pushSubscriptionsTable,
  receiptAttachmentsTable,
  receiptsTable,
  userBillingTable,
  userPreferencesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { logger } from "../lib/logger";
import { performAccountDeletion } from "../lib/accountDeletionRunner";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "../lib/legalAcceptance";
import { lockUserDataMutation } from "../lib/userDataLock";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";
import { isFrozen } from "../lib/accountLifecycleSchedule";
import { getDeletionConfirmationContact, sendAccountDeletedEmail } from "../lib/emailService";

export const EXPORT_FROZEN_MESSAGE =
  "Your account is paused, so in-app export is off. Email contact@receebo.net and we'll send you a copy of your data.";

const router: IRouter = Router();

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
    // Self-serve export only while the account has access. Once frozen
    // (trial ended unpaid / plan lapsed) copies are sent on request by email.
    const access = await getSubscriptionStatus(userId);
    if (isFrozen(access)) {
      res.status(403).json({
        error: "export_unavailable",
        code: "account_frozen",
        message: EXPORT_FROZEN_MESSAGE,
      });
      return;
    }
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
    const emailConnections = await db
      .select({
        provider: emailConnectionsTable.provider,
        accountEmail: emailConnectionsTable.accountEmail,
        status: emailConnectionsTable.status,
        lastSyncedAt: emailConnectionsTable.lastSyncedAt,
        connectedAt: emailConnectionsTable.createdAt,
      })
      .from(emailConnectionsTable)
      .where(eq(emailConnectionsTable.userId, userId));
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
        otherEmailConnections: emailConnections,
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

  if (confirmation !== "DELETE") {
    res.status(400).json({ error: 'Type "DELETE" to confirm account deletion' });
    return;
  }

  // Read the address first: the sign-in account is gone after deletion.
  const contact = await getDeletionConfirmationContact(userId);
  const outcome = await performAccountDeletion(userId, { cancelSubscription: true });
  if (outcome.body) res.status(outcome.status).json(outcome.body);
  else res.status(outcome.status).send();
  if (outcome.status === 204 && contact) {
    void sendAccountDeletedEmail(userId, contact, "requested");
  }
});

export default router;