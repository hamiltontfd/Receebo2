/**
 * Signed links for the smile rating in lifecycle emails (spec §3).
 * token = base64url(JSON payload) "." base64url(HMAC-SHA256(payload)).
 * Payload: user id, email type, email_sends id, locale and expiry (30 days).
 * No login needed; the token alone proves which email the click came from.
 *
 * Key: FEEDBACK_TOKEN_SECRET. Outside production a fixed dev key is used when
 * it is unset; in production without it no rating links are generated.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { EmailLocale } from "./emailLocale";

const isEmailLocale = (v: unknown): v is EmailLocale => v === "en" || v === "pt-PT" || v === "pt-BR";

export const FEEDBACK_TOKEN_TTL_MS = 30 * 86_400_000;
export const FEEDBACK_RATINGS = ["good", "ok", "bad"] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];
const DEV_FALLBACK_KEY = "receebo-dev-only-feedback-token-key";

export function isFeedbackRating(value: unknown): value is FeedbackRating {
  return typeof value === "string" && (FEEDBACK_RATINGS as readonly string[]).includes(value);
}

export interface FeedbackTokenPayload {
  userId: string;
  emailType: string;
  emailSendId: number;
  locale: EmailLocale;
  /** Expiry, ms since epoch. */
  exp: number;
}

export function feedbackTokenKey(env: { FEEDBACK_TOKEN_SECRET?: string; NODE_ENV?: string } = process.env): string | null {
  const key = env.FEEDBACK_TOKEN_SECRET?.trim();
  if (key) return key;
  return env.NODE_ENV === "production" ? null : DEV_FALLBACK_KEY;
}

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function createFeedbackToken(
  input: Omit<FeedbackTokenPayload, "exp">, now = new Date(), key = feedbackTokenKey(),
): string | null {
  if (!key) return null;
  const body = Buffer.from(JSON.stringify({
    u: input.userId, t: input.emailType, s: input.emailSendId, l: input.locale,
    exp: now.getTime() + FEEDBACK_TOKEN_TTL_MS,
  })).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export type FeedbackTokenResult =
  | { ok: true; payload: FeedbackTokenPayload }
  | { ok: false; reason: "invalid" | "expired"; locale?: EmailLocale };

export function verifyFeedbackToken(token: unknown, now = new Date(), key = feedbackTokenKey()): FeedbackTokenResult {
  if (!key || typeof token !== "string" || token.length > 2048) return { ok: false, reason: "invalid" };
  const dot = token.indexOf(".");
  if (dot < 1) return { ok: false, reason: "invalid" };
  const body = token.slice(0, dot);
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(sign(body, key));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  let raw: { u?: unknown; t?: unknown; s?: unknown; l?: unknown; exp?: unknown };
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof raw.u !== "string" || typeof raw.t !== "string" || typeof raw.s !== "number" ||
      !Number.isInteger(raw.s) || !isEmailLocale(raw.l) || typeof raw.exp !== "number") {
    return { ok: false, reason: "invalid" };
  }
  if (now.getTime() > raw.exp) return { ok: false, reason: "expired", locale: raw.l };
  return { ok: true, payload: { userId: raw.u, emailType: raw.t, emailSendId: raw.s, locale: raw.l, exp: raw.exp } };
}
