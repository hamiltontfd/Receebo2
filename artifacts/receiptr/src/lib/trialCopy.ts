/**
 * Free-trial rule and the copy shown when a trial user reaches the receipt cap.
 * Keep in sync with api-server/src/lib/accountTrial.ts (TRIAL_LIMIT,
 * TRIAL_DURATION_DAYS, TRIAL_CAP_MESSAGE).
 *
 * Translations (not wired up yet; the app is English-only today):
 *   pt-PT: "Já usou os seus 5 recibos grátis. Subscreva para adicionar mais." / "Subscrever"
 *   pt-BR: "Você já usou suas 5 notas grátis. Assine para adicionar mais." / "Assinar"
 */
export const TRIAL_RECEIPT_LIMIT = 5;
export const TRIAL_LENGTH_DAYS = 15;

/** One-line notice + server error message once the 5 free receipts are used. */
export const TRIAL_CAP_MESSAGE = "You've used your 5 free receipts. Subscribe to add more.";
export const TRIAL_CAP_BUTTON = "Subscribe";
/** Existing paywall / Stripe Checkout plan picker. */
export const SUBSCRIBE_HREF = "/settings#upgrade-plans";

/** Marketing summary of the trial. */
export const TRIAL_PITCH = "15 days free, no card. Add up to 5 receipts.";

export const TRIAL_EXPIRED_MESSAGE = "Your 15-day free trial has ended. Subscribe to keep using Receebo.";
