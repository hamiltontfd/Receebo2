import { hasNoConsumerDates } from "./purchaseType";

/**
 * Server-side return window calculator.
 * Mirrors key jurisdiction rules from the frontend consumerRights.ts
 * without any frontend dependency.
 */

interface JurisdictionRule {
  code: string;
  onlineReturnDays: number | null;
}

const JURISDICTION_RULES: JurisdictionRule[] = [
  { code: "PT", onlineReturnDays: 14 }, // EU CRD / DL 24/2014
  { code: "EU", onlineReturnDays: 14 }, // EU Directive 2011/83/EU
  { code: "BR", onlineReturnDays: 7 },  // CDC Art. 49
  { code: "US", onlineReturnDays: null },
  { code: "CA", onlineReturnDays: 7 },  // ON CPA 2002 / QC CPA
];

const RETAILER_RETURN_DAYS: Array<{ match: string; days: number }> = [
  { match: "amazon", days: 30 },
  { match: "walmart", days: 90 },
  { match: "target", days: 90 },
  { match: "best buy", days: 15 },
  { match: "bestbuy", days: 15 },
  { match: "zalando", days: 30 },
  { match: "ebay", days: 30 },
  { match: "aliexpress", days: 15 },
  { match: "shein", days: 30 },
  { match: "zara", days: 30 },
  { match: "h&m", days: 30 },
  { match: "asos", days: 28 },
  { match: "shopify", days: 30 },
  { match: "fnac", days: 30 },
];

/** EU member states + EEA (IS, LI, NO), excluding PT (own rule). "EL" is the EU code for Greece. */
const EU_EEA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "EL", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
]);

const PT_MERCHANT_HINTS = [
  "continente", "pingo doce", "worten", "sport zone", "fnac pt",
  "minipreço", "minipreco", "wells", "nos ", "meo ", "vodafone pt",
  "galp", "bp portugal",
];

export function detectCountry(params: {
  currency?: string | null;
  purchaseCountry?: string | null;
  merchant?: string | null;
}): string | null {
  const { currency, purchaseCountry, merchant } = params;
  if (purchaseCountry && purchaseCountry.length === 2) {
    const code = purchaseCountry.toUpperCase();
    // Other EU/EEA countries share the EU minimum rules.
    return EU_EEA_COUNTRIES.has(code) ? "EU" : code;
  }
  if (!currency) return null;
  const cur = currency.toUpperCase();
  if (cur === "BRL") return "BR";
  if (cur === "USD") return "US";
  if (cur === "CAD") return "CA";
  if (cur === "EUR") {
    if (merchant) {
      const ml = merchant.toLowerCase();
      if (PT_MERCHANT_HINTS.some((h) => ml.includes(h))) return "PT";
    }
    return "EU";
  }
  return null;
}

function findRetailerDays(merchant?: string | null): number | null {
  if (!merchant) return null;
  const ml = merchant.toLowerCase();
  for (const { match, days } of RETAILER_RETURN_DAYS) {
    if (ml.includes(match)) return days;
  }
  return null;
}

export interface ReturnWindowResult {
  deadlineDate: Date;
  daysRemaining: number;
  /** The window counts from the delivery date when known, else the purchase date. */
  startsFrom: "delivery" | "purchase";
  /** Length of the window in days. */
  days: number;
  /** "law": statutory withdrawal period; "store": the retailer's return policy. */
  basis: "law" | "store";
}

/**
 * Start of the return window: the delivery date when it is known and valid
 * (not before the purchase), otherwise the purchase date.
 */
export function returnWindowStart(purchaseDate: string, deliveryDate?: string | null): { date: string; from: "delivery" | "purchase" } {
  if (deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) &&
      !Number.isNaN(new Date(deliveryDate + "T00:00:00Z").getTime()) && deliveryDate >= purchaseDate) {
    return { date: deliveryDate, from: "delivery" };
  }
  return { date: purchaseDate, from: "purchase" };
}

/**
 * Compute the return window deadline and days remaining for a receipt.
 * Returns null if no applicable return window exists or the input is invalid.
 */
export function calcReturnWindow(params: {
  purchaseDate: string;
  deliveryDate?: string | null;
  purchaseCountry?: string | null;
  isOnlinePurchase?: boolean | null;
  currency?: string | null;
  merchant?: string | null;
  /** Subscriptions, digital purchases, tickets and services have no return window. */
  purchaseType?: string | null;
}): ReturnWindowResult | null {
  const { purchaseDate, purchaseCountry, isOnlinePurchase, currency, merchant } = params;
  if (hasNoConsumerDates(params.purchaseType)) return null;

  // Parse purchase date — treat as UTC midnight to avoid timezone shifts
  const purchaseDateObj = new Date(purchaseDate + "T00:00:00Z");
  if (isNaN(purchaseDateObj.getTime())) return null;
  const start = returnWindowStart(purchaseDate, params.deliveryDate);

  const countryCode = detectCountry({ currency, purchaseCountry, merchant });
  if (!countryCode) return null;

  const retailerDays = findRetailerDays(merchant);

  // Only an explicit online purchase has a withdrawal window. Unknown channel
  // (null), even at a known retailer, gets no deadline or reminder: the app
  // points to the store's policy instead.
  const isOnline = isOnlinePurchase === true;
  if (!isOnline) return null;

  const rule = JURISDICTION_RULES.find((r) => r.code === countryCode) ?? null;

  let returnDays: number | null = rule?.onlineReturnDays ?? null;
  let basis: "law" | "store" = "law";

  // For US (no statutory right) or as override: use retailer policy
  if ((returnDays == null || countryCode === "US") && retailerDays != null) {
    returnDays = retailerDays;
    basis = "store";
  }

  if (returnDays == null) return null;

  const deadlineDate = new Date(start.date + "T00:00:00Z");
  deadlineDate.setUTCDate(deadlineDate.getUTCDate() + returnDays);

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const daysRemaining = Math.ceil(
    (deadlineDate.getTime() - todayUtc.getTime()) / 86_400_000,
  );

  return { deadlineDate, daysRemaining, startsFrom: start.from, days: returnDays, basis };
}

/** Delivery date edits: null clears it; otherwise a real YYYY-MM-DD not before the purchase. */
export function deliveryDateError(deliveryDate: string | null | undefined, purchaseDate: string | null): string | null {
  if (deliveryDate === undefined || deliveryDate === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(new Date(`${deliveryDate}T00:00:00Z`).getTime())) {
    return "Delivery date must be a date (YYYY-MM-DD)";
  }
  if (purchaseDate && deliveryDate < purchaseDate) return "Delivery date can't be before the purchase date";
  return null;
}
