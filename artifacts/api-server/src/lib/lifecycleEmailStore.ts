/**
 * Storage for lifecycle emails: send log (idempotency, rating link ids), the
 * smile ratings, and the per-account report numbers. Spec:
 * /workspace/receebo/lifecycle-emails.md "Spec para o Engineer" §1-§3.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, emailFeedbackTable, emailSendsTable, receiptsTable } from "@workspace/db";
import { calcReturnWindow } from "./returnWindowCalc";
import { getAccountMarket, rulesRegionForMarket } from "./accountMarket";
import type { EmailLocale } from "./emailLocale";
import type { FeedbackRating } from "./feedbackToken";

export type LifecycleEmailType = "trial_ended" | "deletion_warning_30d" | "deletion_warning_7d" | "account_deleted";
export const FEEDBACK_COMMENT_MAX = 1000;

/** Additive, idempotent startup migration (also run by the test global setup). */
export async function migrateLifecycleEmails(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_sends (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      email_type text NOT NULL,
      idempotency_key text NOT NULL UNIQUE,
      deletion_date date,
      locale text NOT NULL,
      sent_at timestamptz,
      resend_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS email_sends_user_type_idx ON email_sends (user_id, email_type)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_feedback (
      id serial PRIMARY KEY,
      user_id text,
      email_type text NOT NULL,
      email_send_id integer,
      rating text NOT NULL CHECK (rating IN ('good', 'ok', 'bad')),
      locale text NOT NULL,
      comment text CHECK (comment IS NULL OR char_length(comment) <= ${sql.raw(String(FEEDBACK_COMMENT_MAX))}),
      click_count integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS email_feedback_user_type_send_key
      ON email_feedback (user_id, email_type, email_send_id)`);
}

/** Resend idempotency key and email_sends key: {email_type}:{user_id}:{deletion_date}. */
export function lifecycleIdempotencyKey(emailType: LifecycleEmailType, userId: string, deletionDate: Date): string {
  return `${emailType}:${userId}:${deletionDate.toISOString().slice(0, 10)}`;
}

export type SendClaim =
  | { kind: "claimed"; id: number; key: string }
  | { kind: "already_sent"; id: number }
  | { kind: "in_progress" };

/** Insert the send row before sending (its id goes into the rating links). */
export async function claimLifecycleSend(input: {
  userId: string; emailType: LifecycleEmailType; deletionDate: Date; locale: EmailLocale;
}): Promise<SendClaim> {
  const key = lifecycleIdempotencyKey(input.emailType, input.userId, input.deletionDate);
  const [row] = await db.insert(emailSendsTable).values({
    userId: input.userId, emailType: input.emailType, idempotencyKey: key,
    deletionDate: input.deletionDate.toISOString().slice(0, 10), locale: input.locale,
  }).onConflictDoNothing({ target: emailSendsTable.idempotencyKey }).returning({ id: emailSendsTable.id });
  if (row) return { kind: "claimed", id: row.id, key };
  const [existing] = await db.select({ id: emailSendsTable.id, sentAt: emailSendsTable.sentAt })
    .from(emailSendsTable).where(eq(emailSendsTable.idempotencyKey, key));
  return existing?.sentAt ? { kind: "already_sent", id: existing.id } : { kind: "in_progress" };
}

export async function finishLifecycleSend(id: number, ok: boolean, resendId?: string | null): Promise<void> {
  if (ok) {
    await db.update(emailSendsTable).set({ sentAt: new Date(), resendId: resendId ?? null }).where(eq(emailSendsTable.id, id));
  } else {
    // Refused or failed: free the key so the next daily run retries.
    await db.delete(emailSendsTable).where(eq(emailSendsTable.id, id));
  }
}

export async function hasLifecycleSend(userId: string, emailType: LifecycleEmailType): Promise<boolean> {
  const [row] = await db.select({ id: emailSendsTable.id }).from(emailSendsTable)
    .where(and(eq(emailSendsTable.userId, userId), eq(emailSendsTable.emailType, emailType))).limit(1);
  return Boolean(row);
}

// ── Ratings ───────────────────────────────────────────────────────────────────

/** POST /feedback: one row per (user, email type, send); last click wins, click_count + 1, comment kept. */
export async function recordFeedbackRating(input: {
  userId: string; emailType: string; emailSendId: number; rating: FeedbackRating; locale: EmailLocale;
}): Promise<{ rating: FeedbackRating; clickCount: number }> {
  const now = new Date();
  const [row] = await db.insert(emailFeedbackTable).values({
    userId: input.userId, emailType: input.emailType, emailSendId: input.emailSendId,
    rating: input.rating, locale: input.locale, clickCount: 1, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [emailFeedbackTable.userId, emailFeedbackTable.emailType, emailFeedbackTable.emailSendId],
    set: {
      rating: input.rating, locale: input.locale, updatedAt: now,
      clickCount: sql`${emailFeedbackTable.clickCount} + 1`,
    },
  }).returning({ rating: emailFeedbackTable.rating, clickCount: emailFeedbackTable.clickCount });
  return { rating: row.rating as FeedbackRating, clickCount: row.clickCount };
}

/** POST /feedback/comment: stored on the existing rating row. False if there is no rating yet. */
export async function saveFeedbackComment(input: {
  userId: string; emailType: string; emailSendId: number; comment: string;
}): Promise<boolean> {
  const comment = input.comment.trim().slice(0, FEEDBACK_COMMENT_MAX);
  const updated = await db.update(emailFeedbackTable)
    .set({ comment: comment || null, updatedAt: new Date() })
    .where(and(
      eq(emailFeedbackTable.userId, input.userId),
      eq(emailFeedbackTable.emailType, input.emailType),
      eq(emailFeedbackTable.emailSendId, input.emailSendId),
    ))
    .returning({ id: emailFeedbackTable.id });
  return updated.length > 0;
}

/**
 * Account deletion (Hamilton 2 Nov 2026): keep only the anonymous rating
 * (rating, email type, locale, dates), delete the free comment and the send
 * log. Runs inside the deletion transaction.
 */
export const anonymizeLifecycleEmailDataSql = (userId: string) => [
  sql`UPDATE email_feedback SET user_id = NULL, email_send_id = NULL, comment = NULL WHERE user_id = ${userId}`,
  sql`DELETE FROM email_sends WHERE user_id = ${userId}`,
];

// ── Report block numbers ──────────────────────────────────────────────────────

export interface AccountReport {
  receiptsSaved: number;
  returnWindowsTracked: number;
  warrantiesTracked: number;
  alertsSent: number;
}

/**
 * Report numbers for one account (spec §2):
 * - receipts saved: non-draft receipts;
 * - return windows tracked: receipts with a computed return deadline;
 * - warranties tracked: receipts with a legal or manufacturer warranty end
 *   date (receipts, not warranties, so a receipt counts once);
 * - alerts sent: unique reminders already sent (email or push of the same
 *   reminder count once): return 7-day, return 2-day, return 1-day (push),
 *   legal warranty, manufacturer warranty.
 */
export async function getAccountReport(userId: string): Promise<AccountReport> {
  // Same rules as the reminders: the account market decides (US -> US rules).
  const region = rulesRegionForMarket(await getAccountMarket(userId));
  const rows = await db.select({
    purchaseDate: receiptsTable.purchaseDate,
    deliveryDate: receiptsTable.deliveryDate,
    purchaseCountry: receiptsTable.purchaseCountry,
    isOnlinePurchase: receiptsTable.isOnlinePurchase,
    currency: receiptsTable.currency,
    merchant: receiptsTable.merchant,
    purchaseType: receiptsTable.purchaseType,
    returnDays: receiptsTable.returnDays,
    legal: receiptsTable.legalWarrantyExpiresOn,
    manufacturer: receiptsTable.manufacturerWarrantyExpiresOn,
    r7: receiptsTable.returnReminderSent7dAt,
    r2: receiptsTable.returnReminderSent2dAt,
    p2: receiptsTable.returnPushSent2dAt,
    p1: receiptsTable.returnPushSent1dAt,
    wMan: receiptsTable.warrantyReminderSentFor,
    wLegal: receiptsTable.legalWarrantyReminderSentFor,
    pLegal: receiptsTable.legalWarrantyPushSentFor,
    pMan: receiptsTable.manufacturerWarrantyPushSentFor,
  }).from(receiptsTable).where(and(eq(receiptsTable.userId, userId), eq(receiptsTable.isDraft, false)));
  return reportFromRows(rows, region);
}

type ReportRow = {
  purchaseDate: string | null; deliveryDate: string | null; purchaseCountry: string | null;
  isOnlinePurchase: boolean | null; currency: string | null; merchant: string | null; purchaseType: string | null;
  returnDays?: number | null;
  legal: string | null; manufacturer: string | null;
  r7: Date | null; r2: Date | null; p2: Date | null; p1: Date | null;
  wMan: string | null; wLegal: string | null; pLegal: string | null; pMan: string | null;
};

export function reportFromRows(rows: ReportRow[], region: "US" | "PT" = "PT"): AccountReport {
  let returnWindowsTracked = 0;
  let warrantiesTracked = 0;
  let alertsSent = 0;
  for (const r of rows) {
    const window = r.purchaseDate ? calcReturnWindow({
      purchaseDate: r.purchaseDate, deliveryDate: r.deliveryDate, purchaseCountry: r.purchaseCountry,
      isOnlinePurchase: r.isOnlinePurchase, currency: r.currency, merchant: r.merchant, purchaseType: r.purchaseType,
      region, returnDays: r.returnDays ?? null,
    }) : null;
    if (window) returnWindowsTracked++;
    if (r.legal || r.manufacturer) warrantiesTracked++;
    // The 2-day email also stamps the 7-day column with the same time when the
    // 7-day one never went out; that is not a separate alert.
    if (r.r7 && !(r.r2 && r.r7.getTime() === r.r2.getTime())) alertsSent++;
    if (r.r2 || r.p2) alertsSent++;
    if (r.p1) alertsSent++;
    if (r.wLegal || r.pLegal) alertsSent++;
    if (r.wMan || r.pMan) alertsSent++;
  }
  return { receiptsSaved: rows.length, returnWindowsTracked, warrantiesTracked, alertsSent };
}
