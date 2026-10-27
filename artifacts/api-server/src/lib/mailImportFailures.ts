import { sql } from "drizzle-orm";
import { db, mailImportFailuresTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/** A failing email is tried at most this many times (one try per sync). */
export const MAX_IMPORT_ATTEMPTS = 3;

/** Idempotent startup migration (also run by the integration tests' global setup). */
export async function migrateMailImportFailures(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mail_import_failures (
      id          serial PRIMARY KEY,
      user_id     text NOT NULL,
      provider    text NOT NULL,
      message_id  text NOT NULL,
      status      text NOT NULL DEFAULT 'retrying',
      attempts    integer NOT NULL DEFAULT 0,
      last_error  text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT mail_import_failures_user_provider_message_unique UNIQUE (user_id, provider, message_id)
    )
  `);
}

/** Short, log-safe error text for last_error. */
export function failureText(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/\s+/g, " ").slice(0, 300);
}

/**
 * Count one failed import attempt for a message. Returns the new attempt count
 * and whether the message has now failed for good (status "failed").
 */
export async function recordMailImportFailure(
  userId: string,
  provider: string,
  messageId: string,
  error: string,
): Promise<{ attempts: number; failed: boolean }> {
  const result = await db.execute(sql`
    INSERT INTO mail_import_failures (user_id, provider, message_id, status, attempts, last_error)
    VALUES (${userId}, ${provider}, ${messageId},
            CASE WHEN 1 >= ${MAX_IMPORT_ATTEMPTS} THEN 'failed' ELSE 'retrying' END, 1, ${error})
    ON CONFLICT (user_id, provider, message_id) DO UPDATE SET
      attempts   = mail_import_failures.attempts + 1,
      status     = CASE WHEN mail_import_failures.attempts + 1 >= ${MAX_IMPORT_ATTEMPTS} THEN 'failed' ELSE 'retrying' END,
      last_error = EXCLUDED.last_error,
      updated_at = now()
    RETURNING attempts, status`);
  const row = result.rows[0] as { attempts: number; status: string } | undefined;
  return { attempts: Number(row?.attempts ?? 1), failed: row?.status === "failed" };
}

/** A message that finally imported (or was skipped) needs no failure record. */
export async function clearMailImportFailure(userId: string, provider: string, messageId: string): Promise<void> {
  await db.delete(mailImportFailuresTable).where(and(
    eq(mailImportFailuresTable.userId, userId),
    eq(mailImportFailuresTable.provider, provider),
    eq(mailImportFailuresTable.messageId, messageId),
    eq(mailImportFailuresTable.status, "retrying"),
  ));
}
