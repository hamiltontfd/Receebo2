export function currencySymbol(currency?: string | null): string {
  if (!currency || currency === "USD") return "$";
  if (currency === "EUR") return "\u20AC";
  if (currency === "GBP") return "\u00A3";
  return `${currency} `;
}
