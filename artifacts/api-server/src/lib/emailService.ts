import { Resend } from "resend";
import { createHmac } from "crypto";
import { clerkClient } from "@clerk/express";
import { logger } from "./logger";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";

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

function appUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "https://receebo.replit.app";
}

export interface ReceiptSummary {
  id: number;
  merchant?: string | null;
  total?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  originalFileName?: string;
}

export async function sendReceiptReadyEmail(
  userId: string,
  receipt: ReceiptSummary,
): Promise<void> {
  const email = await getUserEmail(userId);
  if (!email) return;

  const merchant = receipt.merchant || receipt.originalFileName || "Your receipt";
  const subject = `Your ${merchant} receipt is ready`;

  const totalStr =
    receipt.total != null
      ? `${receipt.currency ?? ""}${receipt.total.toFixed(2)}`
      : null;

  const dateStr = receipt.purchaseDate
    ? new Date(receipt.purchaseDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const receiptUrl = `${appUrl()}/receipts/${receipt.id}`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
  <p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:0 0 20px;">Receebo</p>
  <h1 style="font-size:22px;font-weight:800;margin:0 0 6px;line-height:1.2;">${merchant}</h1>
  ${totalStr ? `<p style="font-size:30px;font-weight:800;font-family:ui-monospace,monospace;margin:0 0 6px;">${totalStr}</p>` : ""}
  ${dateStr ? `<p style="color:#666;font-size:14px;margin:0 0 28px;">${dateStr}</p>` : '<div style="margin-bottom:28px;"></div>'}
  <a href="${receiptUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;">View Receipt</a>
  <p style="color:#bbb;font-size:12px;margin-top:40px;border-top:1px solid #eee;padding-top:16px;">Your receipt has been processed and is ready to view in Receebo.</p>
</body>
</html>`;

  try {
    await resend.emails.send({ from: FROM, to: email, subject, html });
    logger.info({ receiptId: receipt.id, userId }, "Receipt ready email sent");
  } catch (err) {
    logger.error(
      { err, receiptId: receipt.id, userId },
      "Failed to send receipt ready email",
    );
  }
}

export interface WarrantyReceipt {
  id: number;
  merchant?: string | null;
  warranty: string;
  originalFileName?: string;
}

export async function sendWarrantyReminderEmail(
  userId: string,
  receipt: WarrantyReceipt,
): Promise<void> {
  const email = await getUserEmail(userId);
  if (!email) return;

  const merchant = receipt.merchant || receipt.originalFileName || "Your purchase";
  const subject = `Warranty expiring soon — ${merchant}`;
  const receiptUrl = `${appUrl()}/receipts/${receipt.id}`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
  <p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:0 0 20px;">Receebo — Warranty Reminder</p>
  <h1 style="font-size:22px;font-weight:800;margin:0 0 6px;line-height:1.2;">Warranty expiring soon</h1>
  <p style="font-size:18px;font-weight:600;margin:0 0 8px;">${merchant}</p>
  <p style="color:#444;font-size:14px;margin:0 0 28px;">${receipt.warranty}</p>
  <a href="${receiptUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;">View Receipt</a>
  <p style="color:#bbb;font-size:12px;margin-top:40px;border-top:1px solid #eee;padding-top:16px;">Your warranty is expiring within 30 days. Open the receipt to review your coverage.</p>
</body>
</html>`;

  try {
    await resend.emails.send({ from: FROM, to: email, subject, html });
    logger.info(
      { receiptId: receipt.id, userId },
      "Warranty reminder email sent",
    );
  } catch (err) {
    logger.error(
      { err, receiptId: receipt.id, userId },
      "Failed to send warranty reminder email",
    );
  }
}

// ── Unsubscribe token helpers ─────────────────────────────────────────────────

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
    const expectedHmac = createHmac("sha256", secret)
      .update(userId)
      .digest("base64url");
    if (providedHmac !== expectedHmac) return null;
    return userId;
  } catch {
    return null;
  }
}

// ── Return window reminder email ──────────────────────────────────────────────

export interface ReturnWindowReceipt {
  id: number;
  merchant?: string | null;
  /** First notable item name if available, shown in subject and body */
  notableItemName?: string | null;
  deadlineDate: Date;
  daysRemaining: number;
  originalFileName?: string;
}

export async function sendReturnWindowEmail(
  userId: string,
  receipt: ReturnWindowReceipt,
): Promise<boolean> {
  const email = await getUserEmail(userId);
  if (!email) return false;

  const itemName =
    receipt.notableItemName ||
    receipt.merchant ||
    receipt.originalFileName ||
    "your purchase";

  const daysLabel =
    receipt.daysRemaining === 1 ? "1 day" : `${receipt.daysRemaining} days`;
  const subject = `Your ${itemName} return window closes in ${daysLabel} — still time to act`;
  const receiptUrl = `${appUrl()}/receipts/${receipt.id}`;

  const unsubToken = generateUnsubscribeToken(userId);
  const unsubUrl = `${appUrl()}/api/notifications/unsubscribe?token=${unsubToken}`;

  const deadlineStr = receipt.deadlineDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
  <p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:0 0 20px;">Receebo — Return Reminder</p>
  <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;line-height:1.2;">Still happy with ${itemName}?</h1>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 6px;">
    Your return window closes in <strong>${daysLabel}</strong> — on <strong>${deadlineStr}</strong>.
  </p>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 24px;">
    If you're not completely satisfied, now is the time to act. Open your receipt to check the return details and start a return if needed.
  </p>
  <a href="${receiptUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;">View Receipt</a>
  <p style="color:#bbb;font-size:12px;margin-top:40px;border-top:1px solid #eee;padding-top:16px;">
    You received this because return reminders are enabled for your Receebo account.
    <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a> to stop these emails, or manage preferences in your <a href="${appUrl()}/settings" style="color:#999;">settings</a>.
  </p>
</body>
</html>`;

  try {
    await resend.emails.send({ from: FROM, to: email, subject, html });
    logger.info(
      { receiptId: receipt.id, userId, daysRemaining: receipt.daysRemaining },
      "Return window reminder email sent",
    );
    return true;
  } catch (err) {
    logger.error(
      { err, receiptId: receipt.id, userId },
      "Failed to send return window reminder email",
    );
    return false;
  }
}

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

  const dateStr = trialEndAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const subject =
    daysRemaining === 0
      ? "Your Receebo Pro trial ends today"
      : daysRemaining === 1
        ? "Your Receebo Pro trial ends tomorrow"
        : `Your Receebo Pro trial ends in ${daysRemaining} days`;

  const settingsUrl = `${appUrl()}/settings`;

  // Format plan name and charge amount for the email body
  const planLabel = planInfo?.planName ?? "Receebo Pro";
  let chargeStr: string | null = null;
  if (planInfo?.planAmount != null && planInfo?.planCurrency) {
    const currency = planInfo.planCurrency.toUpperCase();
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
    chargeStr = `${symbol}${(planInfo.planAmount / 100).toFixed(2)}`;
  }

  const chargeLine = chargeStr
    ? `After that, you'll be automatically charged <strong>${chargeStr}</strong> for <strong>${planLabel}</strong> unless you cancel before then.`
    : `After that, you'll be charged automatically for <strong>${planLabel}</strong> unless you cancel before then.`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
  <p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:0 0 20px;">Receebo</p>
  <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;line-height:1.2;">Your free trial ends ${daysLabel}</h1>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 8px;">
    Your <strong>${planLabel}</strong> trial expires on <strong>${dateStr}</strong>. ${chargeLine}
  </p>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 24px;">
    To avoid being charged, cancel your subscription before the trial ends — it only takes one click.
  </p>
  <a href="${settingsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;">Cancel or Manage Subscription</a>
  <p style="color:#bbb;font-size:12px;margin-top:40px;border-top:1px solid #eee;padding-top:16px;">You received this because you signed up for a Receebo Pro trial. Visit your subscription settings to cancel anytime before <strong>${dateStr}</strong>.</p>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject,
      html,
    });
    logger.info({ userId, daysRemaining, planLabel, chargeStr }, "Trial ending email sent");
    return true;
  } catch (err) {
    logger.error({ err, userId }, "Failed to send trial ending email");
    return false;
  }
}
