import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { runDailyMaintenanceIfDue } from "../lib/orphanCleanup";
import { runOutlookSweep } from "../lib/outlookSync";
import { logger } from "../lib/logger";

/**
 * External triggers. Autoscale deployments sleep without traffic, so the
 * in-process hourly tick may never fire; an external cron (cron-job.org) calls
 * these instead. Both need the header x-cron-secret: <CRON_SECRET>.
 *
 *   POST /api/internal/cron/daily-maintenance   once a day, 06:00 Europe/Lisbon
 *   POST /api/internal/cron/mail-sync           every 4 h
 *
 * daily-maintenance: orphan files, warranty, trial and return reminders,
 * frozen-account retention. Shares the DB run lock with the in-process tick, so
 * it never runs twice in ~23h. It then also runs the Outlook sweep, as a
 * fallback in case the 4-hourly job is missing; with the job in place it
 * finds few or no connections due (3 h freshness) and the shared advisory lock
 * answers "busy" if both calls overlap.
 *
 * mail-sync: only the Outlook sweep (incremental: each mailbox lists mail since
 * its last complete sync). Nothing that sends reminder emails runs here.
 *
 * The sweep runs synchronously within the request: autoscale can stop an
 * instance once no request is in flight, so nothing is left running after the
 * response. It has a ~2 min budget per call and only syncs connections not
 * synced in the last 3 h, so calling twice is harmless and a second call
 * continues where a timed-out one stopped (response: outlook.remaining > 0).
 */
const router: IRouter = Router();

/** Constant-time comparison (hashes first so lengths never leak). */
export function cronSecretMatches(provided: unknown, expected: string | undefined): boolean {
  if (!expected || typeof provided !== "string" || provided.length === 0) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** 503 when CRON_SECRET is not set, 401 on a missing or wrong header. */
function authorizeCron(req: Request, res: Response): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    res.status(503).json({ error: "Cron endpoint is not configured" });
    return false;
  }
  if (!cronSecretMatches(req.headers["x-cron-secret"], expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

router.post("/internal/cron/daily-maintenance", async (req: Request, res: Response): Promise<void> => {
  if (!authorizeCron(req, res)) return;
  try {
    const ran = await runDailyMaintenanceIfDue();
    logger.info({ ran }, "Cron: daily maintenance requested");
    let outlook: Awaited<ReturnType<typeof runOutlookSweep>> | { status: "error" };
    try {
      outlook = await runOutlookSweep();
    } catch (err) {
      logger.error({ err }, "Cron: Outlook sweep failed");
      outlook = { status: "error" };
    }
    res.json({ ran, outlook });
  } catch (err) {
    logger.error({ err }, "Cron: daily maintenance failed");
    res.status(500).json({ error: "Daily maintenance failed" });
  }
});

router.post("/internal/cron/mail-sync", async (req: Request, res: Response): Promise<void> => {
  if (!authorizeCron(req, res)) return;
  try {
    const outlook = await runOutlookSweep();
    logger.info({ outlook }, "Cron: mail sync finished");
    res.json({ outlook });
  } catch (err) {
    logger.error({ err }, "Cron: mail sync failed");
    res.status(500).json({ error: "Mail sync failed" });
  }
});

export default router;
