import { Router, type IRouter } from "express";
import { db, guestSessionsTable, receiptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
import { guestSessionRateLimiter } from "../middlewares/guestSessionRateLimiter";

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

router.post("/guest-session/claim", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const guestToken = typeof req.body?.guestToken === "string" ? req.body.guestToken : null;
  if (!guestToken) {
    // No token supplied — safe no-op
    res.sendStatus(204);
    return;
  }

  try {
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

    // Bulk re-assign all receipts owned by the guest token
    const updated = await db
      .update(receiptsTable)
      .set({ userId: clerkUserId })
      .where(eq(receiptsTable.userId, guestToken))
      .returning({ id: receiptsTable.id });

    // Remove the guest session so the token can never be replayed
    await db.delete(guestSessionsTable).where(eq(guestSessionsTable.token, guestToken));

    logger.info(
      { clerkUserId, guestToken, count: updated.length },
      "Guest receipts migrated",
    );

    res.sendStatus(204);
  } catch (error) {
    logger.error({ error, clerkUserId, guestToken }, "Failed to claim guest session");
    res.status(500).json({ error: "Failed to claim guest session" });
  }
});

export default router;
