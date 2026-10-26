import { Router, type IRouter } from "express";
import { db, guestSessionsTable, receiptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import { guestSessionRateLimiter } from "../middlewares/guestSessionRateLimiter";
import { requireAuth } from "../middlewares/requireAuth";
import { lockUserDataMutation, withUserDataLock } from "../lib/userDataLock";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { getSubscriptionStatus, receiptCapReached } from "../lib/subscriptionStatus";
import { accountTrialStatus, TRIAL_CAP_ERROR } from "../lib/accountTrial";
import { trialUploadsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/guest-session", guestSessionRateLimiter, async (req, res): Promise<void> => {
  try {
    // Idempotent: if the client re-submits an existing token, confirm and return it
    const submitted = typeof req.body?.token === "string" ? req.body.token : null;
    if (submitted) {
      const [existing] = await db
        .select()
        .from(guestSessionsTable)
        .where(eq(guestSessionsTable.token, submitted))
        .limit(1);
      if (existing) {
        res.status(200).json({ guestToken: existing.token });
        return;
      }
    }

    const token = randomUUID();
    await db.insert(guestSessionsTable).values({ token });
    res.status(201).json({ guestToken: token });
  } catch (error) {
    logger.error({ error }, "Failed to create guest session");
    res.status(500).json({ error: "Failed to create guest session" });
  }
});

router.post("/guest-session/claim", requireAuth, requireCurrentLegalAcceptance, lockUserDataMutation(async (req, res): Promise<void> => {
  const clerkUserId = req.userId!;

  const guestToken = typeof req.body?.guestToken === "string" ? req.body.guestToken : null;
  if (!guestToken) {
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
      { clerkUserId, guestToken, count: updated.length },
      "Guest receipts migrated",
    );

    res.sendStatus(204);
    });
  } catch (error) {
    logger.error({ error, clerkUserId, guestToken }, "Failed to claim guest session");
    res.status(500).json({ error: "Failed to claim guest session" });
  }
}));

export default router;
