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

const PT_MERCHANT_HINTS = [
  "continente", "pingo doce", "worten", "sport zone", "fnac pt",
  "minipreço", "minipreco", "wells", "nos ", "meo ", "vodafone pt",
  "galp", "bp portugal",
];

function detectCountry(params: {
  currency?: string | null;
  purchaseCountry?: string | null;
  merchant?: string | null;
}): string | null {
  const { currency, purchaseCountry, merchant } = params;
  if (purchaseCountry && purchaseCountry.length === 2) return purchaseCountry.toUpperCase();
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
}

/**
 * Compute the return window deadline and days remaining for a receipt.
 * Returns null if no applicable return window exists or the input is invalid.
 */
export function calcReturnWindow(params: {
  purchaseDate: string;
  purchaseCountry?: string | null;
  isOnlinePurchase?: boolean | null;
  currency?: string | null;
  merchant?: string | null;
}): ReturnWindowResult | null {
  const { purchaseDate, purchaseCountry, isOnlinePurchase, currency, merchant } = params;

  // Parse purchase date — treat as UTC midnight to avoid timezone shifts
  const purchaseDateObj = new Date(purchaseDate + "T00:00:00Z");
  if (isNaN(purchaseDateObj.getTime())) return null;

  const countryCode = detectCountry({ currency, purchaseCountry, merchant });
  if (!countryCode) return null;

  const retailerDays = findRetailerDays(merchant);

  // Determine if online: explicit flag, or null but merchant is a known online retailer
  const isOnline = isOnlinePurchase === true || (isOnlinePurchase == null && retailerDays !== null);
  if (!isOnline) return null;

  const rule = JURISDICTION_RULES.find((r) => r.code === countryCode) ?? null;

  let returnDays: number | null = rule?.onlineReturnDays ?? null;

  // For US (no statutory right) or as override: use retailer policy
  if ((returnDays == null || countryCode === "US") && retailerDays != null) {
    returnDays = retailerDays;
  }

  if (returnDays == null) return null;

  const deadlineDate = new Date(purchaseDateObj);
  deadlineDate.setUTCDate(deadlineDate.getUTCDate() + returnDays);

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const daysRemaining = Math.ceil(
    (deadlineDate.getTime() - todayUtc.getTime()) / 86_400_000,
  );

  return { deadlineDate, daysRemaining };
}
