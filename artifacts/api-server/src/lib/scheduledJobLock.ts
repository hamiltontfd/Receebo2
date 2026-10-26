import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Atomically claim a periodic job run. Returns true for exactly one caller per
 * interval, across restarts and instances (the row lives in PostgreSQL).
 */
export async function claimScheduledRun(job: string, minIntervalMs: number, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - minIntervalMs);
  const result = await db.execute(sql`
    INSERT INTO scheduled_job_runs (job, last_started_at)
    VALUES (${job}, ${now.toISOString()}::timestamptz)
    ON CONFLICT (job) DO UPDATE SET last_started_at = EXCLUDED.last_started_at
      WHERE scheduled_job_runs.last_started_at <= ${cutoff.toISOString()}::timestamptz
    RETURNING job`);
  return result.rows.length > 0;
}
