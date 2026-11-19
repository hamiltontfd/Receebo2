/** Signup notification formatting and bounded delivery. No DB/Clerk imports. */
export interface SignupNotifyData {
  at: Date;
  market?: string | null;
  country?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  hasFbclid?: boolean;
  loginMethod?: "Google" | "e-mail" | "desconhecido";
  email?: string | null;
}

export interface SignupNotifyEnv {
  NODE_ENV?: string;
  SIGNUP_NOTIFY_EMAIL?: string;
  RESEND_API_KEY?: string;
}
export type SignupNotifyReason = "unconfigured" | "recipient_unset" | "resend_error" | "network_error" | "timeout";
export type SignupNotifyResult = { ok: true; id: string } | { ok: false; reason: SignupNotifyReason };
export const SIGNUP_NOTIFY_TIMEOUT_MS = 4_000;

export function signupNotifySkip(env: SignupNotifyEnv): SignupNotifyReason | undefined {
  if (!env.RESEND_API_KEY?.trim()) return "unconfigured";
  if (!env.SIGNUP_NOTIFY_EMAIL?.trim()) return "recipient_unset";
  return undefined;
}

export function maskSignupEmail(email?: string | null): string {
  if (!email || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) return "-";
  const [local, domain] = email.split("@");
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  return `${local[0]}***@${domain[0]}***.${tld}`;
}

export function formatSignupLisbon(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")} (Lisboa)`;
}

// First-touch fields are untrusted input: prevent new lines/control characters in this plain-text report.
const field = (value?: string | null) => value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || "-";

export function signupNotifyMessage(data: SignupNotifyData, nodeEnv?: string) {
  const market = ({ PT: "eu", EU: "eu", US: "us", BR: "br" } as Record<string, string>)[data.market?.toUpperCase() ?? ""] ?? "-";
  return {
    subject: `${nodeEnv === "production" ? "" : "[DEV] "}Novo cadastro no Receebo`,
    text: [
      `Data: ${formatSignupLisbon(data.at)}`,
      `Mercado: ${market}`,
      `País detectado: ${field(data.country)}`,
      `utm_source: ${field(data.utmSource)}`,
      `utm_medium: ${field(data.utmMedium)}`,
      `utm_campaign: ${field(data.utmCampaign)}`,
      `utm_content: ${field(data.utmContent)}`,
      `fbclid: ${data.hasFbclid ? "sim" : "não"}`,
      `Login provável: ${data.loginMethod ?? "desconhecido"}`,
      `E-mail: ${maskSignupEmail(data.email)}`,
    ].join("\n"),
  };
}

/** Dedicated plain-text Resend path: aborts the request, never logs provider bodies or throws. */
export async function sendSignupNotification(
  data: SignupNotifyData,
  options: {
    env?: SignupNotifyEnv;
    fetch?: typeof fetch;
    warn?: (reason: SignupNotifyReason) => void;
    timeoutMs?: number;
  } = {},
): Promise<SignupNotifyResult> {
  const env = options.env ?? process.env;
  const fail = (reason: SignupNotifyReason): SignupNotifyResult => {
    options.warn?.(reason);
    return { ok: false, reason };
  };
  const skip = signupNotifySkip(env);
  if (skip) return fail(skip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? SIGNUP_NOTIFY_TIMEOUT_MS);
  try {
    const response = await (options.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Receebo <hello@receebo.net>",
        to: env.SIGNUP_NOTIFY_EMAIL!.trim(),
        ...signupNotifyMessage(data, env.NODE_ENV),
      }),
    });
    if (!response.ok) return fail("resend_error");
    const result = await response.json() as { id?: unknown };
    return typeof result.id === "string" && result.id
      ? { ok: true, id: result.id } : fail("resend_error");
  } catch {
    return fail(controller.signal.aborted ? "timeout" : "network_error");
  } finally {
    clearTimeout(timer);
  }
}

/** Called with the INSERT ... RETURNING outcome, never with subscription status alone. */
export function notifyOnlyCreatedTrial(created: boolean, notify: () => Promise<unknown>): void {
  if (!created) return;
  // Also protect the signup from synchronous implementation failures.
  try { void notify().catch(() => {}); } catch { /* Notification cannot break signup. */ }
}
