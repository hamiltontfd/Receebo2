/**
 * Lifecycle emails (marketing spec 2 Nov 2026): trial ended without a
 * subscription, deletion warnings 30 and 7 days before, and the deletion
 * confirmation. Sending side: recipient, language, report numbers, links,
 * send log and Resend call. Copy: lifecycleEmailCopy.ts. Triggers: the daily
 * data retention sweep (accountLifecycle.ts) and DELETE /account.
 */
import { appUrl, deliverEmail, formatLocaleFor, getDeletionConfirmationContact, SUPPORT_EMAIL } from "./emailService";
import type { FormatLocale } from "./emailFormat";
import { PUBLISHED_ORIGIN } from "./billingUrls";
import { getUserEmailLocale, type EmailLocale } from "./emailLocale";
import { createFeedbackToken, FEEDBACK_RATINGS, type FeedbackRating } from "./feedbackToken";
import {
  claimLifecycleSend, finishLifecycleSend, getAccountReport, lifecycleIdempotencyKey, type LifecycleEmailType,
} from "./lifecycleEmailStore";
import {
  renderAccountDeletedEmail, renderDeletionWarningEmail, renderTrialEndedEmail, type DeletionStage, type RenderedEmail,
} from "./lifecycleEmailCopy";
import { logger } from "./logger";

export type { DeletionStage };

const utm = (campaign: string) => `utm_source=lifecycle&utm_medium=email&utm_campaign=${campaign}`;

/** The existing subscribe deep link (sign-in first when there is no session). */
export function lifecycleSubscribeUrl(campaign: "trial_ended" | "deletion_30d" | "deletion_7d", base = appUrl()): string {
  return `${base}/settings?${utm(campaign)}#upgrade-plans`;
}

/**
 * Paused accounts have no in-app export (approved plan, docs/account-lifecycle.md):
 * the "download a copy" link opens an email to contact@receebo.net instead.
 */
export function lifecycleExportUrl(locale: EmailLocale): string {
  const subject = locale === "en" ? "Copy of my receipts" : "Cópia dos meus recibos";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export const LIFECYCLE_SIGNUP_URL = `${PUBLISHED_ORIGIN}/?${utm("deleted")}`;
export const lifecyclePrivacyUrl = (base = appUrl()) => `${base}/privacy`;

export function feedbackRatingUrls(
  input: { userId: string; emailType: LifecycleEmailType; emailSendId: number; locale: EmailLocale },
  base = appUrl(), now = new Date(),
): Record<FeedbackRating, string> | null {
  const token = createFeedbackToken(input, now);
  if (!token) return null;
  const urls = {} as Record<FeedbackRating, string>;
  for (const v of FEEDBACK_RATINGS) urls[v] = `${base}/api/feedback/r/${encodeURIComponent(token)}?v=${v}`;
  return urls;
}

async function sendClaimed(input: {
  userId: string; to: string; emailType: LifecycleEmailType; locale: EmailLocale; deletionDate: Date;
  render: (sendId: number) => RenderedEmail;
}): Promise<boolean> {
  const claim = await claimLifecycleSend({
    userId: input.userId, emailType: input.emailType, deletionDate: input.deletionDate, locale: input.locale,
  });
  if (claim.kind === "already_sent") return true;
  if (claim.kind === "in_progress") return false;
  let rendered: RenderedEmail;
  try {
    rendered = input.render(claim.id);
  } catch (err) {
    await finishLifecycleSend(claim.id, false);
    throw err;
  }
  const result = await deliverEmail({
    kind: input.emailType, userId: input.userId, to: input.to,
    subject: rendered.subject, html: rendered.html, text: rendered.text,
    idempotencyKey: claim.key,
    tags: [{ name: "email_type", value: input.emailType }, { name: "locale", value: input.locale }],
    context: { emailSendId: claim.id, locale: input.locale },
  });
  await finishLifecycleSend(claim.id, result.ok, result.id);
  return result.ok;
}

/** 1. Trial ended without a subscription (smile rating, report, paused alerts). */
export async function sendTrialEndedEmail(userId: string, input: { deletionDate: Date }): Promise<boolean> {
  const contact = await getDeletionConfirmationContact(userId);
  if (!contact) return false;
  const locale = await getUserEmailLocale(userId);
  const report = await getAccountReport(userId);
  const formatLocale = await formatLocaleFor(userId, locale);
  const base = appUrl();
  if (!createFeedbackToken({ userId, emailType: "trial_ended", emailSendId: 0, locale })) {
    logger.warn({ userId }, "Lifecycle email: FEEDBACK_TOKEN_SECRET is not set, sending trial_ended without rating links");
  }
  return sendClaimed({
    userId, to: contact.email, emailType: "trial_ended", locale, deletionDate: input.deletionDate,
    render: (sendId) => renderTrialEndedEmail({
      locale, formatLocale, firstName: contact.firstName, privacyUrl: lifecyclePrivacyUrl(base), report,
      deletionDate: input.deletionDate, subscribeUrl: lifecycleSubscribeUrl("trial_ended", base),
      ratingUrls: feedbackRatingUrls({ userId, emailType: "trial_ended", emailSendId: sendId, locale }, base),
    }),
  });
}

/** 2. Deletion warning 30 or 7 days before (replaces the earlier placeholder warnings). */
export async function sendDeletionWarningEmail(
  userId: string, input: { stage: DeletionStage; deletionDate: Date },
): Promise<boolean> {
  const contact = await getDeletionConfirmationContact(userId);
  if (!contact) return false;
  const locale = await getUserEmailLocale(userId);
  const report = await getAccountReport(userId);
  const formatLocale = await formatLocaleFor(userId, locale);
  const base = appUrl();
  const emailType: LifecycleEmailType = input.stage === "30d" ? "deletion_warning_30d" : "deletion_warning_7d";
  return sendClaimed({
    userId, to: contact.email, emailType, locale, deletionDate: input.deletionDate,
    render: () => renderDeletionWarningEmail({
      locale, formatLocale, stage: input.stage, firstName: contact.firstName, privacyUrl: lifecyclePrivacyUrl(base), report,
      deletionDate: input.deletionDate,
      subscribeUrl: lifecycleSubscribeUrl(input.stage === "30d" ? "deletion_30d" : "deletion_7d", base),
      exportUrl: lifecycleExportUrl(locale),
    }),
  });
}

export interface DeletionConfirmationSnapshot {
  email: string;
  firstName: string | null;
  locale: EmailLocale;
  /** Date format, read before deletion too (the market row is deleted with the account). */
  formatLocale: FormatLocale;
  receiptCount: number;
  /** The deletion date the confirmation belongs to (idempotency key). */
  deletionDate: Date;
}

/** Read BEFORE deleting: address, name, language and receipt count are gone afterwards. */
export async function captureDeletionConfirmation(userId: string, deletionDate = new Date()): Promise<DeletionConfirmationSnapshot | null> {
  const contact = await getDeletionConfirmationContact(userId);
  if (!contact) return null;
  // getDeletionConfirmationContact already read the language (before deletion).
  const locale = contact.locale;
  let formatLocale: FormatLocale = locale;
  try {
    formatLocale = await formatLocaleFor(userId, locale);
  } catch { /* keep the language default */ }
  let receiptCount = 0;
  try {
    receiptCount = (await getAccountReport(userId)).receiptsSaved;
  } catch (err) {
    logger.warn({ err, userId }, "Lifecycle email: could not count receipts before deletion");
  }
  return { email: contact.email, firstName: contact.firstName, locale, formatLocale, receiptCount, deletionDate };
}

/**
 * 3. Sent after deletion with the snapshot taken before it. No email_sends row:
 * the account is gone, so nothing about it is written again (no rating links in
 * this email either). Resend's idempotency key alone prevents a double send.
 */
export async function sendAccountDeletedEmail(
  userId: string, snapshot: DeletionConfirmationSnapshot, reason: "inactive" | "requested",
): Promise<boolean> {
  try {
    const rendered = renderAccountDeletedEmail({
      locale: snapshot.locale, formatLocale: snapshot.formatLocale, reason, firstName: snapshot.firstName,
      privacyUrl: lifecyclePrivacyUrl(), deletedReceiptsCount: snapshot.receiptCount, signupUrl: LIFECYCLE_SIGNUP_URL,
    });
    const result = await deliverEmail({
      kind: "account_deleted", userId, to: snapshot.email,
      subject: rendered.subject, html: rendered.html, text: rendered.text,
      idempotencyKey: lifecycleIdempotencyKey("account_deleted", userId, snapshot.deletionDate),
      tags: [{ name: "email_type", value: "account_deleted" }, { name: "locale", value: snapshot.locale }],
      context: { reason, locale: snapshot.locale },
    });
    return result.ok;
  } catch (err) {
    logger.error({ err, userId }, "Lifecycle email: account_deleted confirmation failed");
    return false;
  }
}
