import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { runDailyMaintenanceIfDue } from "../lib/orphanCleanup";
import { logger } from "../lib/logger";

/**
 * External trigger for the daily maintenance (orphan files, warranty, trial and
 * return reminders, frozen-account retention). Autoscale deployments sleep
 * without traffic, so the in-process hourly tick may never fire; an external
 * cron or a Replit Scheduled Deployment calls this once a day instead.
 *
 *   POST /api/internal/cron/daily-maintenance
 *   x-cron-secret: <CRON_SECRET>
 *
 * Shares the DB run lock with the in-process tick, so it never runs twice in ~23h.
 */
const router: IRouter = Router();

/** Constant-time comparison (hashes first so lengths never leak). */
export function cronSecretMatches(provided: unknown, expected: string | undefined): boolean {
  if (!expected || typeof provided !== "string" || provided.length === 0) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

router.post("/internal/cron/daily-maintenance", async (req: Request, res: Response): Promise<void> => {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    res.status(503).json({ error: "Cron endpoint is not configured" });
    return;
  }
  if (!cronSecretMatches(req.headers["x-cron-secret"], expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const ran = await runDailyMaintenanceIfDue();
    logger.info({ ran }, "Cron: daily maintenance requested");
    res.json({ ran });
  } catch (err) {
    logger.error({ err }, "Cron: daily maintenance failed");
    res.status(500).json({ error: "Daily maintenance failed" });
  }
});

export default router;
