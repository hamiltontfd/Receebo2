/** Money and date formatting shared by emails and reminder copy (no side effects). */

/** "€12.50", "£3.00", "US$9.99"; falls back to "12.50 XYZ" for unknown codes. */
export function formatMoney(amount: number, currency?: string | null): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(amount);
    } catch {
      // Unknown ISO code: fall through.
    }
  }
  const fixed = amount.toFixed(2);
  return code ? `${fixed} ${code}` : fixed;
}

/** "26 Oct 2026" (en-GB, UTC). Accepts Date or "YYYY-MM-DD…" strings. */
export function formatEmailDate(value: Date | string): string | null {
  const date = typeof value === "string"
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
    : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
