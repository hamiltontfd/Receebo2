import { advisoryLockPool, connectGuarded, hasDataEncryptionKey, pool, sealField, sealJson, FIELD_ENVELOPE_PREFIX } from "@workspace/db";
import { logger } from "./logger";

/**
 * Background, idempotent encryption of content fields that are still
 * plaintext (docs/data-encryption.md). Runs only when DATA_ENCRYPTION_KEY is
 * set; one instance at a time (session advisory lock); small batches in key
 * order so every run terminates; compare-and-set updates so a concurrent app
 * write is never overwritten (that row is retried on the next run).
 * updated_at is not touched. Logs counts only.
 */
type Table = {
  table: string;
  key: string;
  text: string[];
  json: string[];
};
export const ENCRYPTED_FIELDS: Table[] = [
  { table: "receipts", key: "id", text: ["summary", "ocr_text"], json: ["products", "notable_items"] },
  { table: "pending_imports", key: "id", text: [], json: ["extraction_data"] },
  { table: "gmail_connections", key: "user_id", text: ["gmail_email"], json: [] },
  { table: "email_connections", key: "id", text: ["account_email"], json: [] },
  { table: "push_subscriptions", key: "id", text: ["p256dh", "auth"], json: [] },
];

const LOCK_SQL = "SELECT pg_try_advisory_lock(hashtext('receebo'), hashtext('data-encryption-backfill')) AS locked";
const UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('receebo'), hashtext('data-encryption-backfill'))";
const ENC_LIKE = "enc:v1:%"; // FIELD_ENVELOPE_PREFIX + "%"

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
const textPlain = (c: string) => `(${q(c)} IS NOT NULL AND ${q(c)} NOT LIKE '${ENC_LIKE}')`;
const jsonPlain = (c: string) => `(${q(c)} IS NOT NULL AND jsonb_typeof(${q(c)}) <> 'string')`;

export type BackfillReport = Record<string, { encrypted: number; conflicts: number }>;
export type BackfillResult = { status: "no_key" | "busy" | "done" | "failed"; report: BackfillReport };

/** `userId` limits a run to one user's rows (tests and manual checks). */
type RunOptions = { batchSize: number; pauseMs: number; userId?: string };

export async function backfillTable(t: Table, options: RunOptions): Promise<{ encrypted: number; conflicts: number }> {
  const plain = [...t.text.map(textPlain), ...t.json.map(jsonPlain)].join(" OR ");
  const cols = [t.key, ...t.text, ...t.json].map(q).join(", ");
  let last: string | number | null = null;
  let encrypted = 0;
  let conflicts = 0;
  for (;;) {
    const params: unknown[] = [options.batchSize];
    let after = "";
    if (options.userId !== undefined) { params.push(options.userId); after += ` AND "user_id" = $${params.length}`; }
    if (last !== null) { params.push(last); after += ` AND ${q(t.key)} > $${params.length}`; }
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT ${cols} FROM ${q(t.table)} WHERE (${plain}) ${after} ORDER BY ${q(t.key)} LIMIT $1`, params);
    if (rows.length === 0) break;
    for (const row of rows) {
      const sets: string[] = [];
      const checks: string[] = [];
      const values: unknown[] = [row[t.key]];
      for (const c of t.text) {
        const v = row[c];
        if (typeof v !== "string" || v.startsWith(FIELD_ENVELOPE_PREFIX)) continue;
        values.push(sealField(`${t.table}.${c}`, v), v);
        sets.push(`${q(c)} = $${values.length - 1}`);
        checks.push(`${q(c)} = $${values.length}`);
      }
      for (const c of t.json) {
        const v = row[c];
        if (v === null || v === undefined || typeof v === "string") continue;
        values.push(sealJson(`${t.table}.${c}`, v), JSON.stringify(v));
        sets.push(`${q(c)} = $${values.length - 1}::jsonb`);
        checks.push(`${q(c)} = $${values.length}::jsonb`);
      }
      if (sets.length === 0) continue;
      const result = await pool.query(
        `UPDATE ${q(t.table)} SET ${sets.join(", ")} WHERE ${q(t.key)} = $1 AND ${checks.join(" AND ")}`, values);
      if ((result.rowCount ?? 0) > 0) encrypted++; else conflicts++;
    }
    last = rows[rows.length - 1]![t.key] as string | number;
    if (options.pauseMs > 0) await new Promise((r) => setTimeout(r, options.pauseMs));
  }
  return { encrypted, conflicts };
}

export async function runDataEncryptionBackfill(options: { batchSize?: number; pauseMs?: number; userId?: string } = {}): Promise<BackfillResult> {
  const report: BackfillReport = {};
  if (!hasDataEncryptionKey()) {
    logger.info("DATA_ENCRYPTION_KEY not set: content field encryption backfill skipped");
    return { status: "no_key", report };
  }
  const lease = await connectGuarded(advisoryLockPool, "advisory-lock");
  let locked = false;
  try {
    locked = (await lease.client.query<{ locked: boolean }>(LOCK_SQL)).rows[0]?.locked === true;
    if (!locked) {
      logger.info("Content field encryption backfill already running elsewhere; skipped");
      return { status: "busy", report };
    }
    const opts = { batchSize: options.batchSize ?? 100, pauseMs: options.pauseMs ?? 100, userId: options.userId };
    for (const t of ENCRYPTED_FIELDS) {
      report[t.table] = await backfillTable(t, opts);
    }
    logger.info({ report }, "Content field encryption backfill finished");
    return { status: "done", report };
  } catch (err) {
    // Only the error code/message; never row content.
    const e = err as { code?: unknown; message?: unknown };
    logger.error({ code: e?.code, message: e?.message, report }, "Content field encryption backfill failed (will retry on next start)");
    return { status: "failed", report };
  } finally {
    if (lease.error) lease.release();
    else {
      try { if (locked) await lease.client.query(UNLOCK_SQL); lease.release(); } catch (err) { lease.release(err); }
    }
  }
}
