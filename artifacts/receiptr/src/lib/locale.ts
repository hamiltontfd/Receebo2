/**
 * Locale support (en, pt-PT, pt-BR). Screens adopt translated copy incrementally;
 * this module holds the rules so screens and emails can move over one at a
 * time. Spec: /workspace/receebo-email SPEC §2, docs/locales-and-rights.md.
 *
 * - The saved locale wins. Until there is a user setting, the only override is
 *   localStorage "receebo:locale" (for testing pt-BR/pt-PT screens).
 * - Browser/sign-up fallback: pt-BR → pt-BR, any other pt* → pt-PT, else en.
 * - Without a saved override, browser language selects the UI locale.
 * - Money is EUR for everyone (the subscription), formatted per locale.
 *   Receipt amounts keep the receipt's own currency.
 */
export type AppLocale = "en" | "pt-PT" | "pt-BR";
export const APP_LOCALES: readonly AppLocale[] = ["en", "pt-PT", "pt-BR"];
export const LOCALE_STORAGE_KEY = "receebo:locale";

export function resolveLocale(tag: string | null | undefined): AppLocale {
  const value = (tag ?? "").trim().toLowerCase().replace("_", "-");
  if (value === "pt-br") return "pt-BR";
  if (value === "pt" || value.startsWith("pt-")) return "pt-PT";
  return "en";
}

/** Browser language is independent of account market and purchase country. */
export function getAppLocale(
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
  browserLanguage: string | null | undefined = typeof navigator === "undefined" ? undefined : navigator.languages?.[0] ?? navigator.language,
): AppLocale {
  try {
    const saved = storage?.getItem(LOCALE_STORAGE_KEY);
    if (saved && (APP_LOCALES as readonly string[]).includes(saved)) return saved as AppLocale;
  } catch { /* Storage denial must not disable browser language detection. */ }
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
