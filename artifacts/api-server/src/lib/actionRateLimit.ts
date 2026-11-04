import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

export type LimitedAction = "upload" | "receipt-read" | "mail-sync" | "guest-claim";
const defaults: Record<LimitedAction, [string, number]> = {
  upload: ["ACTION_UPLOAD_PER_MINUTE", 30],
  "receipt-read": ["ACTION_RECEIPT_READS_PER_MINUTE", 120],
  "mail-sync": ["ACTION_MAIL_SYNC_PER_MINUTE", 1],
  "guest-claim": ["ACTION_GUEST_CLAIM_PER_MINUTE", 5],
};
export function actionLimit(action: LimitedAction): number {
  const [name, fallback] = defaults[action];
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}
export function actionKey(action: LimitedAction, identity: string): string {
  return createHash("sha256").update(JSON.stringify([action, identity])).digest("hex");
}

export async function migrateActionRateLimits(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS action_rate_limits (
    key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS action_rate_limits_expiry_idx
    ON action_rate_limits (expires_at)`);
}

/** One atomic PostgreSQL upsert, shared by every process. DB time owns expiry. */
export async function consumeAction(action: LimitedAction, identity: string) {
  const limit = actionLimit(action);
  const query = {
    text: `INSERT INTO action_rate_limits AS bucket (key, hits, expires_at)
      VALUES ($1, 1, statement_timestamp() + interval '1 minute')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN bucket.expires_at <= statement_timestamp() THEN 1
          ELSE LEAST(bucket.hits + 1, $2 + 1) END,
        expires_at = CASE WHEN bucket.expires_at <= statement_timestamp()
          THEN statement_timestamp() + interval '1 minute' ELSE bucket.expires_at END
      RETURNING hits,
        LEAST(60, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - statement_timestamp())))))::integer AS retry_after`,
    values: [actionKey(action, identity), limit],
    // Cancel waiting requests rather than run expensive work without a decision.
    query_timeout: 5000,
  };
  const result = await pool.query<{ hits: number; retry_after: number }>(query);
  return { allowed: result.rows[0].hits <= limit, retryAfter: result.rows[0].retry_after };
}

/** Bounded, concurrency-safe cleanup; does not lock active or renewed counters. */
export async function cleanupActionRateLimits(): Promise<number> {
  const result = await pool.query(`WITH expired AS (
    SELECT key FROM action_rate_limits WHERE expires_at <= statement_timestamp()
    ORDER BY expires_at LIMIT 10000 FOR UPDATE SKIP LOCKED
  ) DELETE FROM action_rate_limits b USING expired e WHERE b.key = e.key`);
  return result.rowCount ?? 0;
}

export function startActionRateLimitCleanup(): void {
  const clean = () => void cleanupActionRateLimits().catch((err) =>
    logger.error({ err }, "Action rate-limit cleanup failed"));
  clean();
  setInterval(clean, 60_000).unref();
}
