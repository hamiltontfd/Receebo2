import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";
import { runTrialReminderSweep } from "../lib/orphanCleanup";

const router: IRouter = Router();

function requireAdminSecret(req: Request, res: Response, next: NextFunction): void {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) {
    logger.warn("ADMIN_SECRET not configured — admin endpoints are disabled");
    res.status(503).json({ error: "Admin endpoints are not configured" });
    return;
  }

  const provided = req.headers["x-admin-secret"];
  if (!provided || provided !== adminSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

/**
 * POST /admin/trial-reminder-dry-run
 *
 * Runs the trial-reminder sweep in dry-run mode: logs which users would receive
 * an email but does not send anything or modify any database state.
 *
 * Protected by the x-admin-secret header (must match the ADMIN_SECRET env var).
 *
 * Response: { matched: Array<{ userId, trialEnd, alreadySent }> }
 */
router.post("/admin/trial-reminder-dry-run", requireAdminSecret, async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info("Admin: trial-reminder dry-run requested");

    const matched = await runTrialReminderSweep({ dryRun: true });

    logger.info({ count: matched.length }, "Admin: trial-reminder dry-run complete");

    res.json({ matched });
  } catch (err) {
    logger.error({ err }, "Admin: trial-reminder dry-run failed");
    res.status(500).json({ error: "Dry-run failed" });
  }
});

export default router;
