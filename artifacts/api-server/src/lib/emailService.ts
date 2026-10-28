import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "crypto";
import { clerkClient } from "@clerk/express";
import { logger } from "./logger";
import { billingOrigin, PUBLISHED_ORIGIN } from "./billingUrls";
import {
  renderReturnReminder, renderWarrantyReminder, type ReminderMessage, type ReminderPurchase,
} from "./reminderCopy";

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Sender configuration ──────────────────────────────────────────────────────
// Resend's shared test sender. It only delivers to the Resend account owner, so
// it stays the default ONLY until receebo.net is verified in Resend (see
// docs/email-sending.md). Switch by setting RESEND_FROM, not by editing code.
export const DEFAULT_EMAIL_FROM = "onboarding@resend.dev";

export interface EmailEnvironment {
  NODE_ENV?: string;
  REPLIT_DEV_DOMAIN?: string;
  RESEND_FROM?: string;
  RESEND_REPLY_TO?: string;
}

/** Single source of truth for From / Reply-To (Reply-To omitted when unset). */
export function emailSender(env: EmailEnvironment = process.env): { from: string; replyTo?: string } {
  const from = env.RESEND_FROM?.trim() || DEFAULT_EMAIL_FROM;
  const replyTo = env.RESEND_REPLY_TO?.trim() || undefined;
  return replyTo ? { from, replyTo } : { from };
}

/**
 * Origin used for every link in an email. Production always uses the verified
 * published origin (same rule as billing redirects); development uses the
 * workspace dev domain.
 */
export function appUrl(env: EmailEnvironment = process.env): string {
  if (env.NODE_ENV === "production") return PUBLISHED_ORIGIN;
  try {
    return billingOrigin(env);
  } catch {
    return PUBLISHED_ORIGIN;
  }
}

// ── Formatting / escaping helpers ─────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

/** Escape user/AI-derived text before it goes into email HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

export const SUBJECT_MAX_LENGTH = 120;

/** Strip control characters/newlines (header injection) and cap the length. */
export function sanitizeSubject(subject: string): string {
  const clean = subject.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > SUBJECT_MAX_LENGTH ? `${clean.slice(0, SUBJECT_MAX_LENGTH - 1).trimEnd()}…` : clean;
}

/** Shorten a single user/AI-derived value used inside a subject line. */
function subjectPart(value: string, max = 60): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

import { formatMoney, formatEmailDate } from "./emailFormat";

export { formatMoney, formatEmailDate };

// ── Delivery ──────────────────────────────────────────────────────────────────

interface DeliverInput {
  kind: string;
  userId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
}

/**
 * Send through Resend and report whether the provider accepted the message.
 * Resend's SDK returns `{ error }` instead of throwing for API rejections
 * (e.g. the test sender writing to a non-owner), so both paths are handled.
 */
async function deliver(input: DeliverInput): Promise<boolean> {
  const { kind, userId, context } = input;
  try {
    const result = await resend.emails.send({
      ...emailSender(),
      to: input.to,
      subject: sanitizeSubject(input.subject),
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);
    if (result?.error) {
      logger.error(
        { kind, userId, ...context, errorName: result.error.name, errorMessage: result.error.message },
        "Email rejected by Resend",
      );
      return false;
    }
    logger.info({ kind, userId, ...context, emailId: result?.data?.id }, "Email accepted by Resend");
    return true;
  } catch (err) {
    logger.error({ kind, userId, ...context, err }, "Email send failed");
    return false;
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  if (userId.startsWith("guest_")) return null;
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    )?.emailAddress;
    return email ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "emailService: failed to fetch Clerk user");
    return null;
  }
}

// ── Unsubscribe ───────────────────────────────────────────────────────────────

/**
 * Generate a self-contained unsubscribe token: base64url(userId).hmac(userId).
 * No DB lookup needed — the receiver decodes the userId then verifies the HMAC.
 */
export function generateUnsubscribeToken(userId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for unsubscribe token generation");
  const hmac = createHmac("sha256", secret).update(userId).digest("base64url");
  const encodedId = Buffer.from(userId).toString("base64url");
  return `${encodedId}.${hmac}`;
}

/**
 * Verify and decode a token produced by generateUnsubscribeToken.
 * Returns the userId on success, null on failure.
 */
export function parseUnsubscribeToken(token: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    logger.error("SESSION_SECRET not set — cannot verify unsubscribe token");
    return null;
  }
  const dotIdx = token.indexOf(".");
  if (dotIdx < 1) return null;
  const encodedId = token.slice(0, dotIdx);
  const providedHmac = token.slice(dotIdx + 1);
  try {
    const userId = Buffer.from(encodedId, "base64url").toString("utf8");
    const expectedHmac = createHmac("sha256", secret).update(userId).digest("base64url");
    const a = Buffer.from(providedHmac);
    const b = Buffer.from(expectedHmac);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}

/** Unsubscribe URL plus RFC 8058 one-click headers for reminder emails. */
export function unsubscribeLinks(userId: string): { url: string; headers: Record<string, string> } {
  const url = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(generateUnsubscribeToken(userId))}`;
  return {
    url,
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

// ── Shared layout ─────────────────────────────────────────────────────────────
// Every HTML email uses this wrapper so new (e.g. lifecycle) templates only
// supply content. The markup reproduces the existing design exactly.

const BODY_STYLE = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;";
const EYEBROW_STYLE = "font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:0 0 20px;";
const BUTTON_STYLE = "display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;";
const FOOTER_STYLE = "color:#bbb;font-size:12px;margin-top:40px;border-top:1px solid #eee;padding-top:16px;";

export interface EmailLayout {
  /** Small uppercase header line, plain text (escaped). */
  eyebrow: string;
  /** Pre-escaped HTML for the main content. */
  bodyHtml: string;
  /** Optional call-to-action button. */
  cta?: { label: string; href: string };
  /** Pre-escaped HTML for the footer note (e.g. why they got it). */
  footerHtml?: string;
  /** Adds the warranty/return unsubscribe + settings line to the footer. */
  unsubscribeUrl?: string;
}

export function emailButton(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="${BUTTON_STYLE}">${escapeHtml(label)}</a>`;
}

export function renderEmailLayout(layout: EmailLayout): string {
  const unsub = layout.unsubscribeUrl
    ? `\n    <a href="${escapeHtml(layout.unsubscribeUrl)}" style="color:#999;">Unsubscribe</a> from warranty and return reminders, or manage preferences in your <a href="${escapeHtml(`${appUrl()}/settings`)}" style="color:#999;">settings</a>.`
    : "";
  const footer = layout.footerHtml || unsub
    ? `\n  <p style="${FOOTER_STYLE}">${layout.footerHtml ?? ""}${unsub}</p>`
    : "";
  return `<!DOCTYPE html>
<html>
<body style="${BODY_STYLE}">
  <p style="${EYEBROW_STYLE}">${escapeHtml(layout.eyebrow)}</p>
  ${layout.bodyHtml}${layout.cta ? `\n  ${emailButton(layout.cta.label, layout.cta.href)}` : ""}${footer}
</body>
</html>`;
}

// ── Payment attention (paid renewals) ─────────────────────────────────────────

export async function sendPaymentAttentionEmail(
  userId: string, invoiceId: string, accessMessage: string,
): Promise<void> {
  const email = await getUserEmail(userId);
  if (!email) throw new Error("Payment notice recipient unavailable");
  // A durable sign-in-protected link, not an expiring bearer portal session.
  const settingsUrl = `${billingOrigin()}/settings`;
  const text = `Your Receebo renewal payment failed. ${accessMessage} Open ${settingsUrl} and choose Update payment details to open Stripe's secure billing portal. Stripe may retry your payment.`;
  const result = await resend.emails.send({
    ...emailSender(),
    to: email, subject: "Action needed: update your Receebo payment details",
    text,
    html: `<h1>Your renewal payment failed</h1><p>${escapeHtml(accessMessage)}</p><p>Stripe may retry your payment. Open Settings and choose Update payment details to use Stripe's secure billing portal.</p><p><a href="${escapeHtml(settingsUrl)}">Update payment details in Receebo</a></p>`,
  }, { idempotencyKey: `payment-attention/${invoiceId}` });
  if (result.error) {
    logger.error({ kind: "payment_attention", userId, invoiceId, errorName: result.error.name,
      errorMessage: result.error.message }, "Email rejected by Resend");
    throw new Error(`Payment notice delivery failed: ${result.error.name}`);
  }
}

// ── Warranty and return reminders (product + amount, Marketing copy 28 Oct 2026) ──

const REMINDER_ITEM_STYLE = "font-size:15px;font-weight:600;color:#121212;line-height:1.5;margin:0 0 6px;";
const REMINDER_SECONDARY_STYLE = "font-size:15px;color:#444;line-height:1.5;margin:0 0 16px;";
const REMINDER_NOTE_STYLE = "font-size:13px;color:#737373;line-height:1.5;margin:0 0 24px;";

/** HTML and plain text of a reminder; every value is escaped here. */
export function renderReminderEmail(
  message: ReminderMessage, opts: { eyebrow: string; receiptUrl: string; unsubscribeUrl?: string },
): { html: string; text: string } {
  const settingsUrl = `${appUrl()}/settings`;
  const html = renderEmailLayout({
    eyebrow: opts.eyebrow,
    bodyHtml: `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(message.preheader)}</div>
  <h1 style="${H1_STYLE}">${escapeHtml(message.title)}</h1>
  <p style="${message.secondary ? REMINDER_ITEM_STYLE : REMINDER_ITEM_STYLE.replace("0 0 6px", "0 0 16px")}">${escapeHtml(message.itemLine)}</p>${
    message.secondary ? `\n  <p style="${REMINDER_SECONDARY_STYLE}">${escapeHtml(message.secondary)}</p>` : ""}
  <p style="${P_STYLE}">${escapeHtml(message.body)}</p>${
    message.note ? `\n  <p style="${REMINDER_NOTE_STYLE}">${escapeHtml(message.note)}</p>` : `\n  <div style="margin:0 0 8px;"></div>`}`,
    cta: { label: "View receipt", href: opts.receiptUrl },
    footerHtml: `${escapeHtml(message.footer)} <a href="${escapeHtml(settingsUrl)}" style="color:#999;">Manage reminders</a>.`,
    unsubscribeUrl: opts.unsubscribeUrl,
  });
  const text = [
    message.title,
    "",
    message.itemLine,
    ...(message.secondary ? [message.secondary] : []),
    "",
    message.body,
    ...(message.note ? ["", message.note] : []),
    "",
    `View receipt: ${opts.receiptUrl}`,
    "",
    `${message.footer} Manage reminders: ${settingsUrl}`,
    ...(opts.unsubscribeUrl ? [`Unsubscribe: ${opts.unsubscribeUrl}`] : []),
  ].join("\n");
  return { html, text };
}

export interface WarrantyReceipt extends ReminderPurchase {
  id: number;
  /** Warranty text from the receipt, if any (not shown; kept for callers). */
  warranty?: string | null;
  originalFileName?: string;
  /** Which warranty ends: the legal one (PT/EU) or the manufacturer's. */
  kind: "legal" | "manufacturer";
  /** End date, YYYY-MM-DD. */
  expiresOn: string;
  /** The other warranty, if it is still running. */
  other?: { kind: "legal" | "manufacturer"; expiresOn: string } | null;
}

export async function sendWarrantyReminderEmail(
  userId: string,
  receipt: WarrantyReceipt,
): Promise<boolean> {
  const email = await getUserEmail(userId);
  if (!email) return false;

  const message = renderWarrantyReminder({
    ...receipt,
    merchant: receipt.merchant || receipt.originalFileName || null,
  });
  const receiptUrl = `${appUrl()}/receipts/${receipt.id}`;
  const unsub = unsubscribeLinks(userId);
  const { html, text } = renderReminderEmail(message, {
    eyebrow: "Receebo — Warranty Reminder", receiptUrl, unsubscribeUrl: unsub.url,
  });

  return deliver({
    kind: "warranty_reminder", userId, to: email, subject: message.subject, html, text,
    headers: unsub.headers, context: { receiptId: receipt.id },
  });
}

export interface ReturnWindowReceipt extends ReminderPurchase {
  id: number;
  /** Legacy: first notable item name, used when notableItems is not given. */
  notableItemName?: string | null;
  deadlineDate: Date;
  daysRemaining: number;
  originalFileName?: string;
  /** "law" (statutory withdrawal period of windowDays) or "store" (retailer policy). */
  basis?: "law" | "store";
  windowDays?: number;
}

export async function sendReturnWindowEmail(
  userId: string,
  receipt: ReturnWindowReceipt,
): Promise<boolean> {
  const email = await getUserEmail(userId);
  if (!email) return false;

  const message = renderReturnReminder({
    ...receipt,
    notableItems: receipt.notableItems ?? (receipt.notableItemName ? [{ name: receipt.notableItemName }] : []),
    deadline: receipt.deadlineDate,
  });
  const receiptUrl = `${appUrl()}/receipts/${receipt.id}`;
  const unsub = unsubscribeLinks(userId);
  const { html, text } = renderReminderEmail(message, {
    eyebrow: "Receebo — Return Reminder", receiptUrl, unsubscribeUrl: unsub.url,
  });

  return deliver({
    kind: "return_window", userId, to: email, subject: message.subject, html, text, headers: unsub.headers,
    context: { receiptId: receipt.id, daysRemaining: receipt.daysRemaining },
  });
}

// ── Legacy Stripe-trial ending reminder ───────────────────────────────────────
// Only for old Stripe subscriptions that still have a Stripe trial. The no-card
// account trial never uses this email.

export interface TrialPlanInfo {
  planName?: string;
  /** Price in the smallest currency unit (e.g. cents for USD) */
  planAmount?: number;
  planCurrency?: string;
}

export async function sendTrialEndingEmail(
  userId: string,
  trialEndAt: Date,
  planInfo?: TrialPlanInfo,
): Promise<boolean> {
  const email = await getUserEmail(userId);
  if (!email) return false;

  const nowMs = Date.now();
  const endMs = trialEndAt.getTime();
  const daysRemaining = Math.max(0, Math.ceil((endMs - nowMs) / 86_400_000));
  const daysLabel =
    daysRemaining === 0
      ? "today"
      : daysRemaining === 1
        ? "tomorrow"
        : `in ${daysRemaining} days`;

  const dateStr = formatEmailDate(trialEndAt) ?? "";

  const subject =
    daysRemaining === 0
      ? "Your Receebo Pro trial ends today"
      : daysRemaining === 1
        ? "Your Receebo Pro trial ends tomorrow"
        : `Your Receebo Pro trial ends in ${daysRemaining} days`;

  const settingsUrl = `${appUrl()}/settings`;

  // Format plan name and charge amount for the email body
  const planLabel = planInfo?.planName ?? "Receebo Pro";
  const chargeStr = planInfo?.planAmount != null && planInfo?.planCurrency
    ? formatMoney(planInfo.planAmount / 100, planInfo.planCurrency)
    : null;

  const chargeLine = chargeStr
    ? `After that, you'll be automatically charged <strong>${escapeHtml(chargeStr)}</strong> for <strong>${escapeHtml(planLabel)}</strong> unless you cancel before then.`
    : `After that, you'll be charged automatically for <strong>${escapeHtml(planLabel)}</strong> unless you cancel before then.`;

  const html = renderEmailLayout({
    eyebrow: "Receebo",
    bodyHtml: `<h1 style="font-size:22px;font-weight:800;margin:0 0 8px;line-height:1.2;">Your free trial ends ${escapeHtml(daysLabel)}</h1>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 8px;">
    Your <strong>${escapeHtml(planLabel)}</strong> trial expires on <strong>${escapeHtml(dateStr)}</strong>. ${chargeLine}
  </p>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 24px;">
    To avoid being charged, cancel your subscription before the trial ends — it only takes one click.
  </p>`,
    cta: { label: "Cancel or Manage Subscription", href: settingsUrl },
    footerHtml: `You received this because you signed up for a Receebo Pro trial. Visit your subscription settings to cancel anytime before <strong>${escapeHtml(dateStr)}</strong>.`,
  });

  return deliver({
    kind: "legacy_trial_ending", userId, to: email, subject, html,
    context: { daysRemaining, planLabel, chargeStr },
  });
}

// ── Account lifecycle: deletion warnings and confirmation ─────────────────────
// PLACEHOLDER COPY: adapted from marketing's lifecycle-emails-en.md to the
// approved plan (no self-serve download while paused: copies by email to
// contact@receebo.net). Marketing owns the final text. Strictly transactional
// (no unsubscribe). The postal address stays [ADDRESS] until Hamilton sets it.

export const SUPPORT_EMAIL = "contact@receebo.net";
export const EMAIL_LEGAL_LINE = "Receebo · operated by Hamilton Freitas · [ADDRESS]";

function lifecycleFooterHtml(reason: string): string {
  return `${escapeHtml(reason)}<br>Questions? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#999;">${SUPPORT_EMAIL}</a>.<br>${escapeHtml(EMAIL_LEGAL_LINE)}`;
}

function lifecycleFooterText(reason: string): string {
  return `--\n${reason}\n\nQuestions? Email ${SUPPORT_EMAIL}\n\n${EMAIL_LEGAL_LINE}`;
}

const P_STYLE = "color:#444;font-size:15px;line-height:1.6;margin:0 0 16px;";
const H1_STYLE = "font-size:22px;font-weight:800;margin:0 0 12px;line-height:1.2;";

async function getUserContact(userId: string): Promise<{ email: string; firstName: string | null } | null> {
  if (userId.startsWith("guest_")) return null;
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
    return email ? { email, firstName: user.firstName ?? null } : null;
  } catch (err) {
    logger.warn({ err, userId }, "emailService: failed to fetch Clerk user");
    return null;
  }
}

/** Email address to use for the post-deletion confirmation (read BEFORE deleting). */
export async function getDeletionConfirmationContact(userId: string) {
  return getUserContact(userId);
}

export type DeletionWarningStage = "30d" | "7d";

export function renderDeletionWarningEmail(input: {
  stage: DeletionWarningStage;
  deletionDate: Date;
  receiptCount: number;
  firstName?: string | null;
  baseUrl?: string;
}): { subject: string; html: string; text: string } {
  const date = formatEmailDate(input.deletionDate) ?? "";
  const subscribeUrl = `${input.baseUrl ?? appUrl()}/settings#upgrade-plans`;
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hi,";
  const receipts = input.receiptCount === 1 ? "your 1 receipt" : `your ${input.receiptCount} receipts`;
  const subject = input.stage === "30d"
    ? `Your Receebo receipts will be deleted on ${date}`
    : "7 days left before we delete your receipts";
  const heading = input.stage === "30d"
    ? `Your receipts will be deleted on ${date}`
    : `Last reminder: your receipts will be deleted on ${date}`;
  const lines = [
    `You don't have an active Receebo subscription, so your account is paused. On ${date} we'll permanently delete your account and everything in it, including ${receipts} and their warranty dates. This can't be undone.`,
    "To keep them, subscribe before then. Subscribing cancels the deletion.",
    `Want a copy of your files first? Email ${SUPPORT_EMAIL} and we'll send it to you.`,
  ];
  const reason = "You're getting this because your Receebo account is paused.";
  const html = renderEmailLayout({
    eyebrow: input.stage === "30d" ? "Receebo — Account paused" : "Receebo — Final reminder",
    bodyHtml: `<h1 style="${H1_STYLE}">${escapeHtml(heading)}</h1>
  <p style="${P_STYLE}">${escapeHtml(greeting)}</p>
  ${lines.map((l) => `<p style="${P_STYLE}">${escapeHtml(l)}</p>`).join("\n  ")}`,
    cta: { label: "Keep my receipts", href: subscribeUrl },
    footerHtml: lifecycleFooterHtml(reason),
  });
  const text = [
    heading.toUpperCase(),
    "",
    greeting,
    "",
    ...lines.flatMap((l) => [l, ""]),
    "Keep my receipts:",
    subscribeUrl,
    "",
    lifecycleFooterText(reason),
  ].join("\n");
  return { subject, html, text };
}

export async function sendDeletionWarningEmail(
  userId: string,
  input: { stage: DeletionWarningStage; deletionDate: Date; receiptCount: number },
): Promise<boolean> {
  const contact = await getUserContact(userId);
  if (!contact) return false;
  const { subject, html, text } = renderDeletionWarningEmail({ ...input, firstName: contact.firstName });
  return deliver({
    kind: `deletion_warning_${input.stage}`, userId, to: contact.email, subject, html, text,
    idempotencyKey: `deletion-warning/${input.stage}/${userId}/${input.deletionDate.toISOString().slice(0, 10)}`,
    context: { stage: input.stage },
  });
}

export function renderAccountDeletedEmail(input: {
  reason: "inactive" | "requested";
  firstName?: string | null;
}): { subject: string; html: string; text: string } {
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hi,";
  const lines = [
    input.reason === "inactive"
      ? "As announced, we've deleted your Receebo account because it had no active subscription for 60 days."
      : "As you asked, we've deleted your Receebo account.",
    "We deleted your account, receipts, uploaded files, extracted data and any Outlook connection. We keep only the billing records the law requires.",
    "If you ever want to start again, you're welcome back anytime at https://receebo.net.",
  ];
  const reason = "You're getting this to confirm your Receebo account was deleted.";
  const subject = "Your Receebo account has been deleted";
  const html = renderEmailLayout({
    eyebrow: "Receebo — Account deleted",
    bodyHtml: `<h1 style="${H1_STYLE}">Your account has been deleted</h1>
  <p style="${P_STYLE}">${escapeHtml(greeting)}</p>
  ${lines.map((l) => `<p style="${P_STYLE}">${escapeHtml(l)}</p>`).join("\n  ")}`,
    footerHtml: lifecycleFooterHtml(reason),
  });
  const text = ["YOUR ACCOUNT HAS BEEN DELETED", "", greeting, "", ...lines.flatMap((l) => [l, ""]),
    lifecycleFooterText(reason)].join("\n");
  return { subject, html, text };
}

/** Sent after deletion, so the address is passed in (the sign-in account is gone). */
export async function sendAccountDeletedEmail(
  userId: string,
  contact: { email: string; firstName: string | null },
  reason: "inactive" | "requested",
): Promise<boolean> {
  const { subject, html, text } = renderAccountDeletedEmail({ reason, firstName: contact.firstName });
  return deliver({
    kind: `account_deleted_${reason}`, userId, to: contact.email, subject, html, text,
    idempotencyKey: `account-deleted/${userId}`,
  });
}

// ── Account deletion code (spec §10, deletion-code.txt) ────────────────────────
// PLACEHOLDER COPY from /workspace/receebo-email/deletion-code.txt. Marketing
// owns the final text. The code is never in the subject or preheader (both show
// on lock screens), and there is no button or link that deletes anything.

const CODE_STYLE = "font-family:'Spline Sans Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace;font-size:32px;line-height:40px;font-weight:600;letter-spacing:8px;padding-left:8px;color:#121212;margin:0;user-select:all;-webkit-user-select:all;";
const CODE_PANEL_STYLE = "background:#F5F5F5;border:1px solid #E6E6E6;border-radius:8px;padding:20px 16px;text-align:center;margin:0 0 16px;";
export const DELETION_CODE_SUBJECT = "Confirm your Receebo account deletion";
export const DELETION_CODE_PREHEADER = "Use the code inside to confirm. It expires in 15 minutes.";

export function renderDeletionCodeEmail(input: { code: string; expiresInMinutes: number }): { subject: string; html: string; text: string } {
  const intro = "You asked to delete your Receebo account. To confirm, enter this code in Receebo. This permanently deletes your account and all your receipts, and it can't be undone.";
  const expiry = `This code expires in ${input.expiresInMinutes} minutes and can only be used once.`;
  const notYou = `Didn't request this? Ignore this email and your account stays as it is. If you think someone else can sign in to your account, email ${SUPPORT_EMAIL}.`;
  const reason = "You're getting this because someone asked to delete the Receebo account linked to this email address.";
  const html = renderEmailLayout({
    eyebrow: "Receebo — Deletion requested",
    bodyHtml: `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(DELETION_CODE_PREHEADER)}</div>
  <h1 style="${H1_STYLE}">Confirm you want to delete your account.</h1>
  <p style="${P_STYLE}">${escapeHtml(intro)}</p>
  <div style="${CODE_PANEL_STYLE}">
    <p style="font-size:12px;line-height:16px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#737373;margin:0 0 8px;">Your code</p>
    <p class="rb-code" style="${CODE_STYLE}">${escapeHtml(input.code)}</p>
  </div>
  <p style="color:#737373;font-size:14px;line-height:20px;margin:0 0 16px;">${escapeHtml(expiry)}</p>
  <p style="color:#737373;font-size:14px;line-height:20px;margin:0 0 16px;">${escapeHtml(notYou)}</p>`,
    footerHtml: lifecycleFooterHtml(reason),
  });
  const text = [
    "ACCOUNT DELETION - deletion requested",
    "",
    "Confirm you want to delete your account.",
    "",
    intro,
    "",
    "Your code:",
    input.code,
    "",
    expiry,
    "",
    notYou,
    "",
    lifecycleFooterText(reason),
  ].join("\n");
  return { subject: DELETION_CODE_SUBJECT, html, text };
}

/** Sends the code to the account's primary email. False if there is no address or Resend refused. */
export async function sendDeletionCodeEmail(
  userId: string,
  contact: { email: string },
  code: { code: string; expiresAt: Date; expiresInMinutes: number },
): Promise<boolean> {
  const { subject, html, text } = renderDeletionCodeEmail(code);
  return deliver({
    kind: "account_deletion_code", userId, to: contact.email, subject, html, text,
    idempotencyKey: `deletion-code/${userId}/${code.expiresAt.getTime()}`,
  });
}
