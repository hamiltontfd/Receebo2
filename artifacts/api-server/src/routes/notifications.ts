import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userPreferencesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { parseUnsubscribeToken, escapeHtml } from "../lib/emailService";
import { logger } from "../lib/logger";
import { lockUserDataMutation, withUserDataLock } from "../lib/userDataLock";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";

const router: IRouter = Router();

function unsubscribePage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:12px;">${escapeHtml(title)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

function tokenFrom(req: { query: Record<string, unknown>; body?: unknown }): string | undefined {
  const fromQuery = req.query["token"];
  if (typeof fromQuery === "string" && fromQuery) return fromQuery;
  const fromBody = (req.body as Record<string, unknown> | undefined)?.["token"];
  return typeof fromBody === "string" && fromBody ? fromBody : undefined;
}

/**
 * GET /notifications/unsubscribe?token=<signed-token>
 *
 * Link in reminder emails. Shows a confirmation button and changes nothing,
 * so link scanners/prefetchers (e.g. Outlook Safe Links) can't unsubscribe.
 */
router.get("/notifications/unsubscribe", (req, res): void => {
  const token = tokenFrom(req);
  if (!token || !parseUnsubscribeToken(token)) {
    res.status(400).send(unsubscribePage("Invalid unsubscribe link",
      `<p style="color:#666;font-size:15px;">This link is invalid. You can manage reminders in your <a href="/settings" style="color:#111;">account settings</a>.</p>`));
    return;
  }
  res.status(200).send(unsubscribePage("Unsubscribe from reminders?",
    `<p style="color:#666;font-size:15px;">Stop warranty and return reminder emails from Receebo.</p>
  <form method="post" action="?token=${escapeHtml(encodeURIComponent(token))}" style="margin-top:24px;">
    <button type="submit" style="background:#111;color:#fff;border:0;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;cursor:pointer;">Unsubscribe</button>
  </form>
  <p style="color:#666;font-size:14px;margin-top:24px;">Or manage reminders in your <a href="/settings" style="color:#111;">account settings</a>.</p>`));
});

/**
 * POST /notifications/unsubscribe?token=<signed-token>
 *
 * The confirmation button and RFC 8058 one-click unsubscribe
 * (List-Unsubscribe-Post: List-Unsubscribe=One-Click). The token encodes the
 * userId and is HMAC-signed with SESSION_SECRET — no auth session needed.
 */
router.post("/notifications/unsubscribe", async (req, res): Promise<void> => {
  const token = tokenFrom(req);
  const userId = token ? parseUnsubscribeToken(token) : null;
  if (!userId) {
    res.status(400).send(unsubscribePage("Invalid unsubscribe link",
      `<p style="color:#666;font-size:15px;">This link is invalid. You can manage reminders in your <a href="/settings" style="color:#111;">account settings</a>.</p>`));
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

    logger.info({ userId }, "User unsubscribed from warranty and return reminder emails");
    res.status(200).send(unsubscribePage("You've been unsubscribed",
      `<p style="color:#666;font-size:15px;">You'll no longer receive warranty and return reminder emails from Receebo.</p>
  <p style="color:#666;font-size:14px;margin-top:24px;">
    You can re-enable reminders at any time from your
    <a href="/settings" style="color:#111;">account settings</a>.
  </p>`));
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
