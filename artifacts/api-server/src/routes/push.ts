import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getVapidPublicKey } from "../lib/pushNotifications";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/push/vapid-key", (_req, res): void => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(503).json({ configured: false });
    return;
  }
  res.json({ configured: true, publicKey });
});

router.post("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";

  if (!endpoint || !p256dh || !auth || endpoint.length > 2048) {
    res.status(400).json({ error: "Invalid push subscription" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint))
      .limit(1);

    if (existing) {
      const ownedByCaller = existing.userId === req.userId;
      const callerProvedPossession = existing.p256dh === p256dh && existing.auth === auth;
      if (!ownedByCaller && !callerProvedPossession) {
        res.status(409).json({ error: "This push endpoint belongs to another account" });
        return;
      }
      await db
        .update(pushSubscriptionsTable)
        .set({ userId: req.userId!, p256dh, auth, updatedAt: new Date() })
        .where(eq(pushSubscriptionsTable.id, existing.id));
    } else {
      await db
        .insert(pushSubscriptionsTable)
        .values({ userId: req.userId!, endpoint, p256dh, auth });
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err, userId: req.userId }, "push/subscribe failed");
    res.status(500).json({ error: "Failed to save push subscription" });
  }
});

router.post("/push/status", requireAuth, async (req, res): Promise<void> => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 2048) {
    res.status(400).json({ error: "Endpoint is required" });
    return;
  }

  try {
    const [existing] = await db
      .select({ userId: pushSubscriptionsTable.userId })
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint))
      .limit(1);
    res.json({ subscribed: existing?.userId === req.userId });
  } catch (err) {
    logger.error({ err, userId: req.userId }, "push/status failed");
    res.status(500).json({ error: "Failed to check push subscription" });
  }
});

router.delete("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  if (!endpoint) {
    res.status(400).json({ error: "Endpoint is required" });
    return;
  }

  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, req.userId!),
          eq(pushSubscriptionsTable.endpoint, endpoint),
        ),
      );
    res.status(204).send();
  } catch (err) {
    logger.error({ err, userId: req.userId }, "push/subscribe DELETE failed");
    res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

export default router;