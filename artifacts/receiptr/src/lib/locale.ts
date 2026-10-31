/**
 * The single web/PWA language source (en, pt-PT, pt-BR), shared by application
 * copy, selectors and consumer-rights display. Language never selects a market,
 * purchase country or currency. Coverage: docs/locales-and-rights.md.
 *
 * - Account language wins while signed in; null uses browser language.
 * - Signed-out visitors always use browser language, ignoring legacy local overrides.
 * - Browser/sign-up fallback: pt-BR → pt-BR, any other pt* → pt-PT, else en.
 * - Without a saved override, browser language selects the UI locale.
 * - Money is EUR for everyone (the subscription), formatted per locale.
 *   Receipt amounts keep the receipt's own currency.
 */
import { useSyncExternalStore } from "react";

export type AppLocale = "en" | "pt-PT" | "pt-BR";
export const APP_LOCALES: readonly AppLocale[] = ["en", "pt-PT", "pt-BR"];
export const LOCALE_STORAGE_KEY = "receebo:locale";
let accountOverride: AppLocale | null | undefined;
const listeners = new Set<() => void>();
export function notifyLocaleChange() {
  listeners.forEach((listener) => listener());
}
/** undefined = visitor; null = account using automatic browser language. Both use the browser. */
export function setAccountLocale(language: AppLocale | null | undefined) {
  accountOverride = language;
  notifyLocaleChange();
}
export function useAppLocale(): AppLocale {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, getAppLocale);
}
export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(tag: string | null | undefined): AppLocale {
  const value = (tag ?? "").trim().toLowerCase().replace("_", "-");
  if (value === "pt-br") return "pt-BR";
  if (value === "pt" || value.startsWith("pt-")) return "pt-PT";
  return "en";
}

/** Browser language is independent of account market and purchase country. */
export function getAppLocale(
  _legacyStorage: Pick<Storage, "getItem"> | null = null,
  browserLanguage: string | null | undefined = typeof navigator === "undefined" ? undefined : navigator.languages?.[0] ?? navigator.language,
): AppLocale {
  // Explicit arguments keep this helper usable for deterministic formatting/tests.
  if (arguments.length === 0 && accountOverride !== undefined) {
    return accountOverride ?? resolveLocale(browserLanguage);
  }
  return resolveLocale(browserLanguage);
}

const PT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** en "Dec 12, 2026" · pt-PT "12 dez 2026" · pt-BR "12 de dez. de 2026" (date-only values, no timezone shift). */
export function formatLocaleDate(date: Date, locale: AppLocale): string {
  if (locale === "pt-PT") return `${date.getDate()} ${PT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
    day: "numeric", month: "short", year: "numeric",
  }).format(date);
}

/** en "€449.00" · pt-PT "449,00 €" · pt-BR "€ 449,00" (plain spaces; HTML callers can swap in &nbsp;). */
export function formatLocaleMoney(amount: number, locale: AppLocale, currency = "EUR"): string {
  const tag = locale === "en" ? "en-IE" : locale;
  return new Intl.NumberFormat(tag, { style: "currency", currency }).format(amount).replace(/\u00a0|\u202f/g, " ");
}
