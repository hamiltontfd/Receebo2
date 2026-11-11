/** Money and date formatting shared by emails and reminder copy (no side effects). */

/**
 * English money follows en-US, matching the web. Dates keep en-GB order for
 * "en" and en-US order for US-market accounts writing in English.
 */
export type FormatLocale = "en" | "en-US" | "pt-PT" | "pt-BR";
const intlLocale = (locale: FormatLocale) => (locale === "en" ? "en-GB" : locale);

/** "€12.50", "£3.00", "$9.99"; falls back to "12.50 XYZ" for invalid codes. */
export function formatMoney(amount: number, currency?: string | null, locale: FormatLocale = "en"): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(locale === "en" ? "en-US" : intlLocale(locale), { style: "currency", currency: code }).format(amount);
    } catch {
      // Unknown ISO code: fall through.
    }
  }
  const fixed = amount.toFixed(2);
  return code ? `${fixed} ${code}` : fixed;
}

/**
 * "26 Oct 2026" (en-GB, UTC; en-US: "Oct 26, 2026"); Portuguese: the long form
 * "4 de janeiro de 2027" (pt-PT and pt-BR). The short-month pattern is not used
 * for Portuguese because ICU renders pt-PT as "4/01/2027".
 * Accepts Date or "YYYY-MM-DD…" strings.
 */
export function formatEmailDate(value: Date | string, locale: FormatLocale = "en"): string | null {
  const date = typeof value === "string"
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
    : value;
  if (Number.isNaN(date.getTime())) return null;
  const month = locale === "pt-PT" || locale === "pt-BR" ? "long" : "short";
  return date.toLocaleDateString(intlLocale(locale), { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}
