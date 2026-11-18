/** Channel inference only. Never determines the buyer's country or overrides false. */
export function merchantSuggestsOnline(merchant?: string | null, storeDomain?: string | null): boolean {
  if (merchant && /\bamazon\b/i.test(merchant)) return true;
  if (!storeDomain) return false;
  const hostname = storeDomain.trim().replace(/^https?:\/\//i, "").split(/[/?#:]/, 1)[0];
  return /^(?:[a-z0-9-]+\.)*amazon\.(?:com(?:\.(?:br|mx|au|be|tr))?|co\.(?:uk|jp|za)|es|pt|de|fr|it|nl|pl|se|ie|ca|in|sg|ae|sa|eg|jp|cn)$/i.test(hostname);
}

export function isOnlineForConsumerRights(
  isOnlinePurchase: boolean | null | undefined,
  merchant?: string | null,
  storeDomain?: string | null,
): boolean {
  return isOnlinePurchase === true
    || (isOnlinePurchase == null && merchantSuggestsOnline(merchant, storeDomain));
}

/**
 * A receipt can state its return duration in the warranty-text field. Parse
 * only explicit numeric day lengths attached to return/refund/exchange terms;
 * conflicting, vague, non-day, or out-of-range text is left unknown.
 */
export function parseReceiptReturnDays(text?: string | null): number | null {
  if (!text) return null;
  const term = String.raw`(?:returns?|refunds?|exchanges?|devolu(?:ção|ções|coes|cao|ción|ciones)|trocas?)`;
  const duration = String.raw`(\d{1,3})\s*(?:-\s*)?(?:calendar\s+)?(?:days?|d[ií]as?)`;
  const patterns = [
    new RegExp(String.raw`\b${duration}\s+(?:(?:for|para|de|of)\s+)?${term}(?=$|[^A-Za-z])`, "giu"),
    new RegExp(String.raw`\b${term}(?:\s+(?:window|policy|period))?\s*(?:(?:within|in|of|is|em|até|ate|de)\s+|:\s*|-)?${duration}\b`, "giu"),
  ];
  const found = new Set<number>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const days = Number(match[1]);
      if (Number.isInteger(days) && days >= 0 && days <= 365) found.add(days);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

/**
 * Receipt warranty text is only a safe generic fallback when it names no
 * product and states one unambiguous warranty duration. A duration attached
 * to a named line or multiple competing year/month durations stays item-scoped.
 */
export function isReceiptWarrantyTextScoped(
  text?: string | null,
  itemNames?: ReadonlyArray<string | null | undefined> | null,
): boolean {
  if (!text) return false;
  if (/\b\d{1,3}\s*(?:-|–|—|to|or)\s*\d{1,3}\s*(?:years?|yrs?|months?|mos?|anos?|m[eê]s(?:es)?)\b/i.test(text)) return true;

  const durations = new Set<number>();
  const durationPattern = /(\d{1,3})\s*(?:-\s*)?(years?|yrs?|months?|mos?|anos?|m[eê]s(?:es)?)/giu;
  for (const match of text.matchAll(durationPattern)) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    durations.add(/^(?:years?|yrs?|anos?)$/.test(unit) ? amount * 12 : amount);
  }
  if (durations.size > 1) return true;

  const normalizedText = text.toLowerCase().replace(/[^a-z0-9à-ú]+/g, " ").trim();
  const textWords = new Set(normalizedText.split(/\s+/).filter(Boolean));
  if (/\b(?:tv|tvs|televisions?|televisores?|sound\s?bars?|soundbars?|laptops?|notebooks?|computers?|smartphones?|cell\s?phones?|tablets?|refrigerators?|fridges?)\b/i.test(text)) {
    return true;
  }
  const generic = new Set([
    "the", "and", "for", "with", "from", "item", "items", "product", "products", "goods",
    "manufacturer", "warranty", "warranties", "guarantee", "guarantees", "coverage", "brand",
    "electronics", "home", "clothing", "apparel", "other", "year", "years", "yr", "yrs",
    "month", "months", "mo", "mos", "ano", "anos", "mes", "mês", "meses",
  ]);
  for (const name of itemNames ?? []) {
    if (!name) continue;
    const words = name.toLowerCase().replace(/[^a-z0-9à-ú]+/g, " ").trim().split(/\s+/).filter((word) => word && !generic.has(word) && !/^\d+$/.test(word));
    if (words.some((word) => textWords.has(word))) return true;
  }
  return false;
}
