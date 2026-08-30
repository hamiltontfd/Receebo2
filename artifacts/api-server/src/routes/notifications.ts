import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userPreferencesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { parseUnsubscribeToken } from "../lib/emailService";
import { logger } from "../lib/logger";
import { lockUserDataMutation, withUserDataLock } from "../lib/userDataLock";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";

const router: IRouter = Router();

/**
 * GET /notifications/unsubscribe?token=<signed-token>
 *
 * One-click unsubscribe link embedded in reminder emails.
 * The token encodes the userId and is HMAC-signed with SESSION_SECRET —
 * no auth session needed to process this request.
 */
router.get("/notifications/unsubscribe", async (req, res): Promise<void> => {
  const token = req.query["token"] as string | undefined;

  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  const userId = parseUnsubscribeToken(token);
  if (!userId) {
    res.status(400).send("Invalid or expired unsubscribe link");
    return;
  }

  try {
    await withUserDataLock(userId, async () => {
      if (await isAccountDeletionInProgress(userId)) return;
      await db
        .insert(userPreferencesTable)
        .values({ userId, notificationsOptOut: true })
        .onConflictDoUpdate({
          target: userPreferencesTable.userId,
          set: { notificationsOptOut: true },
        });
    });

    logger.info({ userId }, "User unsubscribed from return window emails");

    // Return a minimal confirmation page
    res.status(200).send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:12px;">You've been unsubscribed</h1>
  <p style="color:#666;font-size:15px;">You'll no longer receive return window reminder emails from Receebo.</p>
  <p style="color:#666;font-size:14px;margin-top:24px;">
    You can re-enable reminders at any time from your
    <a href="/settings" style="color:#111;">account settings</a>.
  </p>
</body>
</html>`);
  } catch (err) {
    logger.error({ err, userId }, "Failed to process unsubscribe");
    res.status(500).send("Something went wrong. Please try again later.");
  }
});

/**
 * GET /notifications/preferences — current user's notification opt-out flag
 */
router.get(
  "/notifications/preferences",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.userId!;
    try {
      const [row] = await db
        .select({ notificationsOptOut: userPreferencesTable.notificationsOptOut })
        .from(userPreferencesTable)
        .where(eq(userPreferencesTable.userId, userId))
        .limit(1);

      res.json({ optOut: row?.notificationsOptOut ?? false });
    } catch (err) {
      logger.error({ err, userId }, "notifications/preferences GET failed");
      res.status(500).json({ error: "Failed to load preferences" });
    }
  },
);

/**
 * PATCH /notifications/preferences — toggle email reminder opt-out
 * Body: { optOut: boolean }
 */
router.patch(
  "/notifications/preferences",
  requireAuth,
  lockUserDataMutation(async (req, res): Promise<void> => {
    const userId = req.userId!;
    const { optOut } = req.body as { optOut?: unknown };

    if (typeof optOut !== "boolean") {
      res.status(400).json({ error: "optOut must be a boolean" });
      return;
    }

    try {
      await db
        .insert(userPreferencesTable)
        .values({ userId, notificationsOptOut: optOut })
        .onConflictDoUpdate({
          target: userPreferencesTable.userId,
          set: { notificationsOptOut: optOut },
        });

      logger.info({ userId, optOut }, "Notification preferences updated");
      res.json({ optOut });
    } catch (err) {
      logger.error({ err, userId }, "notifications/preferences PATCH failed");
      res.status(500).json({ error: "Failed to update preferences" });
    }
  }),
);

export default router;
