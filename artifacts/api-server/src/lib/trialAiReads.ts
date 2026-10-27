import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * No-card trial AI budget: at most 10 AI reads (receipt extractions) per
 * trial account, whether the result is saved or discarded. Shared by camera/
 * file uploads and Outlook (email) imports. Paid, owner and legacy Stripe
 * trial accounts are not capped.
 */
export const TRIAL_AI_READ_LIMIT = 10;
export const TRIAL_AI_READS_MESSAGE =
  `You've used the ${TRIAL_AI_READ_LIMIT} free receipt reads in your trial. Subscribe to add more.`;
export const TRIAL_AI_READS_ERROR = {
  error: "subscription_required",
  code: "trial_ai_reads_exhausted",
  message: TRIAL_AI_READS_MESSAGE,
} as const;

/** Access states that are subject to the AI read cap. */
export function aiReadCapApplies(accessState: string | undefined | null): boolean {
  return accessState === "account_trial" || accessState === "trial_exhausted";
}

/** Idempotent startup migration (also run by integration tests). */
export async function migrateTrialAiReads(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trial_ai_reads (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      source text NOT NULL,
      ref text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS trial_ai_reads_user_idx ON trial_ai_reads(user_id);
    CREATE INDEX IF NOT EXISTS trial_ai_reads_user_source_ref_idx ON trial_ai_reads(user_id, source, ref);
  `);
}

export async function countTrialAiReads(userId: string): Promise<number> {
  const result = await db.execute(sql`SELECT count(*)::int AS n FROM trial_ai_reads WHERE user_id = ${userId}`);
  return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export async function trialAiReadsRemaining(userId: string): Promise<number> {
  return Math.max(0, TRIAL_AI_READ_LIMIT - (await countTrialAiReads(userId)));
}

/**
 * Atomically record one AI read if the trial still has budget. Returns false
 * (and records nothing) at the cap. Callers hold the per-user data lock, and
 * the conditional INSERT keeps the count exact even without it.
 *
 * A read with the same (source, ref) as an earlier one is a retry of the same
 * email or receipt: it is allowed again and NOT counted a second time.
 */
export async function claimTrialAiRead(
  userId: string,
  source: "upload" | "email",
  ref?: string | null,
): Promise<boolean> {
  const refValue = ref ?? null;
  const result = await db.execute(sql`
    WITH prior AS (
      SELECT 1 FROM trial_ai_reads
       WHERE user_id = ${userId} AND source = ${source} AND ref = ${refValue}
       LIMIT 1
    ), inserted AS (
      INSERT INTO trial_ai_reads (user_id, source, ref)
      SELECT ${userId}, ${source}, ${refValue}
       WHERE NOT EXISTS (SELECT 1 FROM prior)
         AND (SELECT count(*) FROM trial_ai_reads WHERE user_id = ${userId}) < ${TRIAL_AI_READ_LIMIT}
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM prior) AS prior, EXISTS (SELECT 1 FROM inserted) AS inserted`);
  const row = result.rows[0] as { prior?: boolean; inserted?: boolean } | undefined;
  return Boolean(row?.prior || row?.inserted);
}
