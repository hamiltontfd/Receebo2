import { formatLocaleDate, type AppLocale } from "./locale";
import { rightsCopy } from "./rightsCopy";

/**
 * Consumer rights derivation utility.
 * Computes return windows and statutory warranty info from receipt fields.
 * All rules are in one place — update here when laws change.
 */

// ── Jurisdiction rules ──────────────────────────────────────────────────────

interface JurisdictionRule {
  code: string;
  label: string;
  /** Statutory warranty years for durable new goods; null = none / days-based */
  warrantyYears: number | null;
  /** Warranty only applies to these categories */
  durableCategories: string[];
  /** Cooling-off / distance-selling return days; null = no statutory right */
  onlineReturnDays: number | null;
  warrantyCitation: string | null;
  returnCitation: string | null;
  /** BR/US rules are drafts until a lawyer reviews them. */
  legalReviewPending?: boolean;
}

const JURISDICTION_RULES: JurisdictionRule[] = [
  {
    code: "PT",
    label: "Portugal",
    // Decree-Law 84/2021 (in force 1 Jan 2022) implementing EU Directive 2019/771
    // 3 years for new goods, 2 years for second-hand (using 3 as conservative default)
    warrantyYears: 3,
    durableCategories: ["Electronics", "Home", "Clothing & Apparel", "Other"],
    // EU Consumer Rights Directive 2011/83/EU, transposed via DL 24/2014
    onlineReturnDays: 14,
    warrantyCitation: "Decree-Law 84/2021",
    returnCitation: "EU CRD / DL 24/2014",
  },
  {
    code: "EU",
    label: "EU",
    // EU Directive 2019/771 — 2 year minimum (PT extends to 3, handled above)
    warrantyYears: 2,
    durableCategories: ["Electronics", "Home", "Clothing & Apparel", "Other"],
    // EU Directive 2011/83/EU
    onlineReturnDays: 14,
    warrantyCitation: "EU Directive 2019/771",
    returnCitation: "EU Directive 2011/83/EU",
  },
  {
    code: "BR",
    label: "Brazil",
    // CDC Art. 26 (Lei 8.078/1990): 90 days durable, 30 days non-durable
    // Handled specially below — warrantyYears is null, we use days instead
    warrantyYears: null,
    durableCategories: ["Electronics", "Home", "Clothing & Apparel", "Other"],
    // CDC Art. 49: 7 calendar days from delivery
    onlineReturnDays: 7,
    warrantyCitation: "CDC Art. 26 (Lei 8.078/1990)",
    returnCitation: "CDC Art. 49",
    legalReviewPending: true,
  },
  {
    code: "US",
    label: "United States",
    // Magnuson-Moss Warranty Act: no mandatory duration; FTC Cooling-Off only for door-to-door
    warrantyYears: null,
    durableCategories: [],
    onlineReturnDays: null,
    warrantyCitation: null,
    returnCitation: null,
    legalReviewPending: true,
  },
  {
    code: "CA",
    label: "Canada",
    // Implied warranty of merchantability; Ontario CPA 2002 + Quebec CPA: 7-day cooling-off
    warrantyYears: null,
    durableCategories: [],
    onlineReturnDays: 7,
    warrantyCitation: null,
    returnCitation: "ON CPA 2002 / QC CPA",
  },
];

// ── Known online retailer return windows (used when no statutory right exists) ─

/** Map of merchant name fragment (lowercase) → return days */
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

// ── Country detection ────────────────────────────────────────────────────────

/** Merchants whose name strongly suggests Portugal as country */
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

  // Prefer AI-extracted country
  if (purchaseCountry && purchaseCountry.length === 2) {
    return purchaseCountry.toUpperCase();
  }

  if (!currency) return null;
  const cur = currency.toUpperCase();

  if (cur === "BRL") return "BR";
  if (cur === "USD") return "US";
  if (cur === "CAD") return "CA";

  if (cur === "EUR") {
    // Try to distinguish Portugal from generic EU
    if (merchant) {
      const ml = merchant.toLowerCase();
      if (PT_MERCHANT_HINTS.some((h) => ml.includes(h))) return "PT";
    }
    return "EU";
  }

  // GBP, JPY, etc. — not in our jurisdiction table
  return null;
}

function findRetailer(merchant?: string | null): { days: number; label: string } | null {
  if (!merchant) return null;
  const ml = merchant.toLowerCase();
  for (const { match, days } of RETAILER_RETURN_DAYS) {
    if (ml.includes(match)) return { days, label: merchant };
  }
  return null;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function daysFromNow(target: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function fmtDate(d: Date, locale?: AppLocale): string {
  if (locale) return formatLocaleDate(d, locale);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Manufacturer warranty length from the receipt's warranty text, in months
 * ("2-year manufacturer warranty", "Garantia de 12 meses", "1 ano de garantia").
 * Only text that mentions a warranty counts; return policies ("30-day returns")
 * and legal-warranty mentions ("garantia legal de 3 anos") don't.
 */
export function parseManufacturerWarrantyMonths(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (!/warrant|garantia|guarantee/.test(t)) return null;
  // "Garantia legal de 3 anos" is the legal warranty, already shown on its own.
  if (/\blegal\b|statutory|\blei\b|dl\s*84/.test(t) && !/manufacturer|fabricante|\bmarca\b|brand|extended|estendida|alargada/.test(t)) return null;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, five: 5, um: 1, uma: 1, dois: 2, "três": 3, tres: 3, cinco: 5 };
  const num = String.raw`(?:^|[^a-z0-9à-ú])(\d{1,3}|one|two|three|five|um|uma|dois|três|tres|cinco)`;
  const years = t.match(new RegExp(`${num}\\s*(?:-\\s*)?(?:years?|yrs?|anos?)\\b`));
  const months = t.match(new RegExp(`${num}\\s*(?:-\\s*)?(?:months?|m[eê]s(?:es)?)\\b`));
  const value = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : words[raw] ?? NaN);
  const total = years ? value(years[1]) * 12 : months ? value(months[1]) : NaN;
  return Number.isFinite(total) && total >= 1 && total <= 120 ? total : null;
}

// ── Public types ─────────────────────────────────────────────────────────────

export type ReturnUrgency = "green" | "amber" | "red" | "expired";

export interface ReturnWindowInfo {
  deadline: Date;
  daysLeft: number;
  isExpired: boolean;
  formattedDeadline: string;
  source: string;
  urgency: ReturnUrgency;
  /** Counted from the delivery date when known, else the purchase date. */
  startsFrom: "delivery" | "purchase";
}

export interface StatutoryWarrantyInfo {
  /**
   * "warranty": a legal warranty period (PT/EU).
   * "complaint_deadline": BR CDC art. 26, a deadline to report apparent defects
   * counted from delivery (not a warranty period).
   */
  kind: "warranty" | "complaint_deadline";
  /** Human-readable label, e.g. "3-year legal warranty" */
  label: string;
  expiry: Date;
  formattedExpiry: string;
  citation: string;
  daysUntilExpiry: number;
  isExpired: boolean;
}

/** Manufacturer (contractual) warranty read from the receipt. Shown next to the legal one, never added to it. */
export interface ManufacturerWarrantyInfo {
  label: string;
  months: number;
  expiry: Date;
  formattedExpiry: string;
  daysUntilExpiry: number;
  isExpired: boolean;
}

export interface ConsumerRightsResult {
  hasAny: boolean;
  countryLabel: string | null;
  returnWindow: ReturnWindowInfo | null;
  warranty: StatutoryWarrantyInfo | null;
  manufacturerWarranty: ManufacturerWarrantyInfo | null;
  /** Extra fixed notes for the country (BR: hidden defects, art. 18, art. 49; US: no federal minimum). */
  notes: string[];
  disclaimer: string;
  /** True for BR/US: draft rules, show the [LEGAL REVIEW NEEDED] marker. */
  legalReviewPending: boolean;
}

// ── Main derivation ──────────────────────────────────────────────────────────

/** Delivery date when known and not before the purchase; else the purchase date. */
export function returnWindowStartDate(
  purchaseDate: string,
  deliveryDate?: string | null,
): { date: string; from: "delivery" | "purchase" } {
  if (
    deliveryDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) &&
    !isNaN(new Date(deliveryDate + "T00:00:00").getTime()) &&
    deliveryDate >= purchaseDate
  ) {
    return { date: deliveryDate, from: "delivery" };
  }
  return { date: purchaseDate, from: "purchase" };
}

export function deriveConsumerRights(params: {
  purchaseDate?: string | null;
  deliveryDate?: string | null;
  category?: string | null;
  currency?: string | null;
  purchaseCountry?: string | null;
  isOnlinePurchase?: boolean | null;
  merchant?: string | null;
  /** The receipt's warranty text (manufacturer warranty, if stated). */
  warrantyText?: string | null;
  locale?: AppLocale;
}): ConsumerRightsResult {
  const { purchaseDate, category, currency, purchaseCountry, isOnlinePurchase, merchant } = params;
  const copy = rightsCopy(params.locale);
  const fmt = (d: Date) => fmtDate(d, params.locale);

  const none: ConsumerRightsResult = {
    hasAny: false, countryLabel: null, returnWindow: null, warranty: null,
    manufacturerWarranty: null, notes: [], disclaimer: copy.disclaimer, legalReviewPending: false,
  };

  if (!purchaseDate) return none;
  const purchaseDateObj = new Date(purchaseDate + "T00:00:00");
  if (isNaN(purchaseDateObj.getTime())) return none;

  const countryCode = detectCountry({ currency, purchaseCountry, merchant });
  if (!countryCode) return none;

  const rule = JURISDICTION_RULES.find((r) => r.code === countryCode) ?? null;
  const countryLabel = rule?.label ?? countryCode;
  const cat = category ?? "Other";
  const isDurable = rule ? rule.durableCategories.includes(cat) : false;
  const retailer = findRetailer(merchant);

  // Determine if this is an online purchase:
  //  - Explicit field set to true
  //  - OR: field is null/unset but merchant matches a known online retailer
  const isOnline = isOnlinePurchase === true || (isOnlinePurchase == null && retailer !== null);

  // ── Return window ──────────────────────────────────────────────────────────
  let returnWindow: ReturnWindowInfo | null = null;

  if (isOnline) {
    let returnDays: number | null = null;
    let returnSource: string | null = null;

    // Statutory cooling-off right (EU/PT/BR/CA)
    if (rule?.onlineReturnDays != null) {
      returnDays = rule.onlineReturnDays;
      returnSource = rule.returnCitation;
    }

    // For US (no statutory right), or as a complementary source: retailer policy
    if ((returnDays == null || countryCode === "US") && retailer) {
      returnDays = retailer.days;
      // The retailer table is unsourced: in the US label it as typical, check with the store.
      returnSource = countryCode === "US"
        ? copy.returnSourceTypicalStorePolicy(merchant ?? "")
        : copy.returnSourceStorePolicy(merchant ?? "");
    }

    if (returnDays != null && returnSource != null) {
      const start = returnWindowStartDate(purchaseDate, params.deliveryDate);
      const deadline = addDays(new Date(start.date + "T00:00:00"), returnDays);
      const daysLeft = daysFromNow(deadline);
      const isExpired = daysLeft < 0;
      const urgency: ReturnUrgency =
        isExpired ? "expired" : daysLeft <= 1 ? "red" : daysLeft <= 7 ? "amber" : "green";

      returnWindow = {
        deadline,
        daysLeft,
        isExpired,
        formattedDeadline: fmt(deadline),
        source: returnSource,
        urgency,
        startsFrom: start.from,
      };
    }
  }

  // ── Statutory warranty ─────────────────────────────────────────────────────
  let warranty: StatutoryWarrantyInfo | null = null;

  if (countryCode === "BR") {
    // CDC art. 26: 30 days (non-durable) / 90 days (durable) to report apparent
    // defects, counted from effective delivery (§1). A deadline to complain,
    // not a warranty period. [LEGAL REVIEW NEEDED]
    if (cat !== "Groceries") {
      const warrantyDays = isDurable ? 90 : 30;
      const start = returnWindowStartDate(purchaseDate, params.deliveryDate);
      const expiry = addDays(new Date(start.date + "T00:00:00"), warrantyDays);
      const daysUntilExpiry = daysFromNow(expiry);
      warranty = {
        kind: "complaint_deadline",
        label: copy.brComplaintDeadline(warrantyDays),
        expiry,
        formattedExpiry: fmt(expiry),
        citation: "CDC Art. 26 (Lei 8.078/1990)",
        daysUntilExpiry,
        isExpired: daysUntilExpiry < 0,
      };
    }
  } else if (rule?.warrantyYears != null && isDurable && cat !== "Groceries") {
    const expiry = addYears(purchaseDateObj, rule.warrantyYears);
    const daysUntilExpiry = daysFromNow(expiry);
    warranty = {
      kind: "warranty",
      label: copy.legalWarrantyYears(rule.warrantyYears),
      expiry,
      formattedExpiry: fmt(expiry),
      citation: rule.warrantyCitation ?? "",
      daysUntilExpiry,
      isExpired: daysUntilExpiry < 0,
    };
  }

  // ── Manufacturer warranty: its own end date, side by side, never added to the legal one ──
  let manufacturerWarranty: ManufacturerWarrantyInfo | null = null;
  const months = parseManufacturerWarrantyMonths(params.warrantyText);
  if (months != null) {
    const expiry = new Date(purchaseDateObj);
    expiry.setMonth(expiry.getMonth() + months);
    const daysUntilExpiry = daysFromNow(expiry);
    manufacturerWarranty = {
      label: copy.manufacturerWarranty(months),
      months,
      expiry,
      formattedExpiry: fmt(expiry),
      daysUntilExpiry,
      isExpired: daysUntilExpiry < 0,
    };
  }

  const notes: string[] = [];
  if (countryCode === "BR" && cat !== "Groceries") {
    notes.push(copy.brHiddenDefectNote, copy.brRepairNote);
    if (isOnline) notes.push(copy.brWithdrawalNote);
  }
  if (countryCode === "US") notes.push(copy.usNoStatutoryNote);

  const hasAny = returnWindow !== null || warranty !== null || manufacturerWarranty !== null || notes.length > 0;
  return {
    hasAny, countryLabel, returnWindow, warranty, manufacturerWarranty, notes,
    disclaimer: copy.disclaimer,
    legalReviewPending: rule?.legalReviewPending === true,
  };
}
