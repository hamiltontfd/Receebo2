/** Money and date formatting shared by emails and reminder copy (no side effects). */

/**
 * "en" = en-GB style (PT/EU accounts, unchanged); "en-US" = US-market accounts
 * writing in English (US mode G, 2 Nov 2026): "Nov 27, 2028", "$1,299.99".
 */
export type FormatLocale = "en" | "en-US" | "pt-PT" | "pt-BR";
const intlLocale = (locale: FormatLocale) => (locale === "en" ? "en-GB" : locale);

/** "€12.50", "£3.00", "US$9.99" (en-US: "$9.99"); falls back to "12.50 XYZ" for unknown codes. */
export function formatMoney(amount: number, currency?: string | null, locale: FormatLocale = "en"): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: code }).format(amount);
    } catch {
      // Unknown ISO code: fall through.
    }
  }
  const fixed = amount.toFixed(2);
  return code ? `${fixed} ${code}` : fixed;
}

/** "26 Oct 2026" (en-GB, UTC; en-US: "Oct 26, 2026"). Accepts Date or "YYYY-MM-DD…" strings. */
export function formatEmailDate(value: Date | string, locale: FormatLocale = "en"): string | null {
  const date = typeof value === "string"
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
    : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
