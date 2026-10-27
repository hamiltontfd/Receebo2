/**
 * Account deletion confirmed by a 6-digit code sent to the account email
 * (spec: docs/account-lifecycle.md §4, /workspace/receebo-email SPEC §10).
 *
 * - The code is never stored in clear: HMAC-SHA256 keyed with SESSION_SECRET
 *   and the user id.
 * - Expires after 15 minutes, single use, at most 5 wrong attempts.
 * - Sending is rate limited: 60 s between emails, at most 5 emails per hour.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db, accountDeletionCodesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export const DELETION_CODE_TTL_MS = 15 * 60_000;
export const DELETION_CODE_MAX_ATTEMPTS = 5;
export const DELETION_CODE_RESEND_COOLDOWN_MS = 60_000;
export const DELETION_CODE_MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;

/** Idempotent startup migration (also run by integration tests). */
export async function migrateAccountDeletionCodes(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS account_deletion_codes (
      user_id text PRIMARY KEY,
      code_hash text,
      expires_at timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      last_sent_at timestamptz NOT NULL,
      send_window_started_at timestamptz NOT NULL,
      sends_in_window integer NOT NULL DEFAULT 0
    )`);
}

export function generateDeletionCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Accepts "482913", "482 913" or "482-913"; returns the 6 digits or null. */
export function normalizeDeletionCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function hashDeletionCode(userId: string, code: string, secret = process.env.SESSION_SECRET): string {
  if (!secret) throw new Error("SESSION_SECRET is required for account deletion codes");
  return createHmac("sha256", secret).update(`account-deletion:${userId}:${code}`).digest("hex");
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

/** Creates (or replaces) the pending code. The previous code stops working. */
export async function issueDeletionCode(userId: string, now = new Date()): Promise<IssueResult> {
  return db.transaction(async (tx) => {
    // Serialises concurrent requests for the same user.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`deletion-code:${userId}`}))`);
    const [existing] = await tx.select().from(accountDeletionCodesTable)
      .where(eq(accountDeletionCodesTable.userId, userId));
    const t = now.getTime();
    let windowStart = now;
    let sends = 0;
    if (existing) {
      const sinceLast = t - existing.lastSentAt.getTime();
      if (sinceLast < DELETION_CODE_RESEND_COOLDOWN_MS) {
        return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.ceil((DELETION_CODE_RESEND_COOLDOWN_MS - sinceLast) / 1000) };
      }
      if (t - existing.sendWindowStartedAt.getTime() < HOUR_MS) {
        windowStart = existing.sendWindowStartedAt;
        sends = existing.sendsInWindow;
        if (sends >= DELETION_CODE_MAX_SENDS_PER_HOUR) {
          return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.ceil((windowStart.getTime() + HOUR_MS - t) / 1000) };
        }
      }
    }
    const code = generateDeletionCode();
    const expiresAt = new Date(t + DELETION_CODE_TTL_MS);
    const values = {
      codeHash: hashDeletionCode(userId, code), expiresAt, attempts: 0,
      lastSentAt: now, sendWindowStartedAt: windowStart, sendsInWindow: sends + 1,
    };
    await tx.insert(accountDeletionCodesTable).values({ userId, ...values })
      .onConflictDoUpdate({ target: accountDeletionCodesTable.userId, set: values });
    return { ok: true, code, expiresAt };
  });
}

/** The email could not be sent: drop the code so it can't be guessed, keep the rate-limit counters. */
export async function invalidateDeletionCode(userId: string): Promise<void> {
  await db.update(accountDeletionCodesTable).set({ codeHash: null, expiresAt: null })
    .where(eq(accountDeletionCodesTable.userId, userId));
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "too_many_attempts" }
  | { ok: false; reason: "invalid"; attemptsLeft: number };

/** Checks and consumes the code. Each wrong guess uses one of the 5 attempts. */
export async function verifyDeletionCode(userId: string, input: unknown, now = new Date()): Promise<VerifyResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(accountDeletionCodesTable)
      .where(eq(accountDeletionCodesTable.userId, userId)).for("update");
    if (!row?.codeHash || !row.expiresAt) return { ok: false, reason: "missing" };
    if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
    if (row.attempts >= DELETION_CODE_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
    const code = normalizeDeletionCode(input);
    const matches = code !== null && timingSafeEqual(
      Buffer.from(hashDeletionCode(userId, code), "hex"), Buffer.from(row.codeHash, "hex"),
    );
    if (matches) {
      // Single use: the hash is cleared, the rate-limit counters stay.
      await tx.update(accountDeletionCodesTable).set({ codeHash: null, expiresAt: null })
        .where(eq(accountDeletionCodesTable.userId, userId));
      return { ok: true };
    }
    const attempts = row.attempts + 1;
    await tx.update(accountDeletionCodesTable).set({ attempts })
      .where(eq(accountDeletionCodesTable.userId, userId));
    if (attempts >= DELETION_CODE_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
    return { ok: false, reason: "invalid", attemptsLeft: DELETION_CODE_MAX_ATTEMPTS - attempts };
  });
}

export const DELETION_CODE_ERRORS: Record<Exclude<VerifyResult, { ok: true }>["reason"] | "required", string> = {
  required: "Enter the 6-digit code we emailed you.",
  missing: "Request a new code to confirm deletion.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many wrong codes. Request a new one.",
  invalid: "That code isn't right. Check the email and try again.",
};
