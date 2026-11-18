/**
 * The single web/PWA language source (en, pt-PT, pt-BR), shared by application
 * copy, selectors and consumer-rights display. Language never selects a market,
 * purchase country or currency. Coverage: docs/locales-and-rights.md.
 *
 * - Account language wins while signed in; null uses browser language.
 * - Signed-out visitors use browser language, except the explicit /us landing
 *   defaults to English until a different market is deliberately selected.
 * - Browser/sign-up fallback: pt-BR → pt-BR, any other pt* → pt-PT, else en.
 * - Without a saved override, browser language selects the UI locale.
 * - Money uses the amount's own currency, formatted per UI locale.
 */
import { useSyncExternalStore } from "react";

export type AppLocale = "en" | "pt-PT" | "pt-BR";
export const APP_LOCALES: readonly AppLocale[] = ["en", "pt-PT", "pt-BR"];
export const LOCALE_STORAGE_KEY = "receebo:locale";
let accountOverride: AppLocale | null | undefined;
let publicOverride: AppLocale | undefined;
const listeners = new Set<() => void>();
export function notifyLocaleChange() {
  listeners.forEach((listener) => listener());
}
/** undefined = visitor; null = account using automatic browser language. Both use the browser. */
export function setAccountLocale(language: AppLocale | null | undefined) {
  accountOverride = language;
  notifyLocaleChange();
}
/** Presentation-only override for the explicit US landing; never a legal-country signal. */
export function setPublicLocale(language: AppLocale | undefined) {
  if (publicOverride === language) return;
  publicOverride = language;
  notifyLocaleChange();
}
export function useAppLocale(): AppLocale {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, getAppLocale, () => "en");
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
  if (arguments.length === 0 && publicOverride) return publicOverride;
  // Explicit arguments keep this helper usable for deterministic formatting/tests.
  if (arguments.length === 0 && accountOverride !== undefined) {
    return accountOverride ?? resolveLocale(browserLanguage);
  }
  return resolveLocale(browserLanguage);
}

const PT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** en "Dec 12, 2026" · pt-PT "12 dez 2026" · pt-BR "12 de dez. de 2026" (date-only values, no timezone shift). */
export function formatLocaleDate(value: Date | string, locale: AppLocale): string {
  // A date without a time is a calendar day, not an instant at UTC midnight.
  const date = typeof value === "string"
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
    : value;
  if (locale === "pt-PT") return `${date.getDate()} ${PT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
    day: "numeric", month: "short", year: "numeric",
  }).format(date);
}

/** en "€449.00" · pt-PT "449,00 €" · pt-BR "€ 449,00" (plain spaces; HTML callers can swap in &nbsp;). */
export function formatLocaleMoney(amount: number, locale: AppLocale, currency = "EUR"): string {
  const tag = locale === "en" ? "en-US" : locale;
  return new Intl.NumberFormat(tag, { style: "currency", currency }).format(amount).replace(/\u00a0|\u202f/g, " ");
}

/** Currency-only prefix for editable amounts; an absent currency keeps the USD fallback. */
export function formatCurrencySymbol(locale: AppLocale, currency?: string | null): string {
  const tag = locale === "en" ? "en-US" : locale;
  const symbol = new Intl.NumberFormat(tag, {
    style: "currency", currency: currency || "USD", currencyDisplay: "narrowSymbol",
  }).formatToParts(0).find(part => part.type === "currency")?.value ?? "$";
  return symbol.replace(/\u00a0|\u202f/g, " ");
}

/** Two decimal places without grouping, only for initializing an editable money field. */
export function formatMoneyInput(amount: number, locale: AppLocale): string {
  const tag = locale === "en" ? "en-US" : locale;
  return new Intl.NumberFormat(tag, {
    useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount).replace(/\u00a0|\u202f/g, " ");
}

/** Both decimal styles are accepted. Mixed separators use the last mark as decimal. */
export function parseMoneyInput(value: string): number | undefined {
  const text = value.trim();
  if (!text || !/^[+-]?(?:\d+(?:[.,]\d+)*[.,]?|[.,]\d+)$/.test(text)) return undefined;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let normalized: string;
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    normalized = `${text.slice(0, decimal).replace(/[.,]/g, "")}.${text.slice(decimal + 1)}`;
  } else {
    // Repeated marks of only one kind are ambiguous, not a valid decimal value.
    if ((text.match(/[.,]/g)?.length ?? 0) > 1) return undefined;
    normalized = text.replace(",", ".");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}
