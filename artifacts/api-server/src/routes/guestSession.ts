import { Router, type IRouter } from "express";
import { db, guestSessionsTable, receiptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { actionRateLimiter } from "../middlewares/actionRateLimiter";
import { requireAuth } from "../middlewares/requireAuth";
import { lockUserDataMutation, withUserDataLock } from "../lib/userDataLock";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { getSubscriptionStatus, receiptCapReached } from "../lib/subscriptionStatus";
import { accountTrialStatus, TRIAL_CAP_ERROR } from "../lib/accountTrial";
import { trialUploadsTable } from "@workspace/db";

const router: IRouter = Router();
const guestClaimRateLimiter = actionRateLimiter("guest-claim");

// Guest mode is switched off: no new guest sessions, nothing is created.
router.post("/guest-session", (_req, res): void => {
  res.status(410).json({
    error: "Guest mode is no longer available. Create an account to start your free trial.",
    code: "GUEST_MODE_DISABLED",
  });
});

const MAX_GUEST_TOKEN_LENGTH = 128;

// One-time move of an old guest's receipts into the signed-in account. Only a
// token already in guest_sessions qualifies (server-issued UUIDs, plus legacy
// guest-* ids seeded there in July 2026); the session row is deleted in the
// same transaction, so each token can be claimed once.
router.post("/guest-session/claim", requireAuth, requireCurrentLegalAcceptance, guestClaimRateLimiter, lockUserDataMutation(async (req, res): Promise<void> => {
  const clerkUserId = req.userId!;

  const guestToken = typeof req.body?.guestToken === "string" ? req.body.guestToken : null;
  if (!guestToken || guestToken.length > MAX_GUEST_TOKEN_LENGTH || guestToken === clerkUserId) {
    // No token supplied — safe no-op
    res.sendStatus(204);
    return;
  }

  try {
    await withUserDataLock(guestToken, async () => {
    const [session] = await db
      .select()
      .from(guestSessionsTable)
      .where(eq(guestSessionsTable.token, guestToken))
      .limit(1);

    if (!session) {
      // Already claimed or never existed — graceful no-op
      res.sendStatus(204);
      return;
    }

    const access = await getSubscriptionStatus(clerkUserId);
    const guestReceipts = await db.select().from(receiptsTable)
      .where(eq(receiptsTable.userId, guestToken));
    const count = guestReceipts.filter(r => ["completed", "processing"].includes(r.status)).length;
    const trial = access.accessState === "account_trial" ? await accountTrialStatus(clerkUserId) : null;
    if (count > 0 && (receiptCapReached(access) || (trial && trial.remaining < count))) {
      res.status(403).json({ ...TRIAL_CAP_ERROR,
        message: `${TRIAL_CAP_ERROR.message} Your guest data has not been deleted.` });
      return;
    }
    if (!access.canUseApp) {
      res.status(403).json({ error: "subscription_required", message: "Upgrade to claim these receipts. Your guest data has not been deleted." });
      return;
    }
    const updated = await db.transaction(async tx => {
      const migrated = await tx
      .update(receiptsTable)
      .set({ userId: clerkUserId })
      .where(eq(receiptsTable.userId, guestToken))
      .returning({ id: receiptsTable.id });
      if (trial) {
        for (const receipt of guestReceipts.filter(r => ["completed", "processing"].includes(r.status))) {
          await tx.insert(trialUploadsTable).values({
            userId: clerkUserId, objectPath: receipt.objectPath,
            state: receipt.status === "completed" ? "succeeded" : "processing",
            receiptId: receipt.id, expiresAt: trial.trial.endsAt,
          });
        }
      }
      await tx.delete(guestSessionsTable).where(eq(guestSessionsTable.token, guestToken));
      return migrated;
    });

    logger.info(
      { clerkUserId, count: updated.length },
      "Guest receipts migrated",
    );

    res.sendStatus(204);
    });
  } catch (error) {
    logger.error({ error, clerkUserId }, "Failed to claim guest session");
    res.status(500).json({ error: "Failed to claim guest session" });
  }
}));

export default router;
