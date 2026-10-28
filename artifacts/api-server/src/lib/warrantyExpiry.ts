/**
 * Server-side warranty end dates for reminders (and later the in-app
 * notifications list). Mirrors the PT/EU legal warranty and the manufacturer
 * warranty parsing in receiptr/src/lib/consumerRights.ts, without any frontend
 * dependency. Pure: no DB access.
 *
 * Legal and manufacturer warranties are separate dates, shown side by side and
 * never added together. Brazil (CDC art. 26) is a complaint deadline, not a
 * warranty, and is left out until legal review.
 */
import { detectCountry, returnWindowStart } from "./returnWindowCalc";
import { hasNoConsumerDates } from "./purchaseType";

/** Bump when the rules change so the startup backfill recomputes stored dates. */
export const WARRANTY_CALC_VERSION = 3;

const LEGAL_WARRANTY_YEARS: Record<string, number> = { PT: 3, EU: 2 };
// "Entertainment" keeps the same legal-warranty treatment as "Other" for
// receipts without a purchase type. Tickets, subscriptions and digital
// purchases lose their dates through purchaseType (Hamilton, 28 Oct 2026),
// not through the category.
const DURABLE_CATEGORIES = new Set(["Electronics", "Home", "Clothing & Apparel", "Entertainment", "Other"]);
const ISO_DATE_RE = /(\d{4}-\d{2}-\d{2})/g;

export function isIsoDate(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add whole months in UTC, clamped to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const targetMonthIndex = (m - 1) + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))));
}

/** Add whole years in UTC, clamped (29 Feb + 1 year = 28 Feb). */
export function addYearsClamped(iso: string, years: number): string {
  return addMonthsClamped(iso, years * 12);
}

/**
 * Manufacturer warranty length from the receipt's warranty text, in months
 * ("2-year manufacturer warranty", "Garantia de 12 meses", "1 ano de garantia").
 * Same rules as the web app: return policies and legal-warranty mentions don't count.
 */
export function parseManufacturerWarrantyMonths(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (!/warrant|garantia|guarantee/.test(t)) return null;
  if (/\blegal\b|statutory|\blei\b|dl\s*84/.test(t) && !/manufacturer|fabricante|\bmarca\b|brand|extended|estendida|alargada/.test(t)) return null;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, five: 5, um: 1, uma: 1, dois: 2, "três": 3, tres: 3, cinco: 5 };
  const num = String.raw`(?:^|[^a-z0-9à-ú])(\d{1,3}|one|two|three|five|um|uma|dois|três|tres|cinco)`;
  const years = t.match(new RegExp(`${num}\\s*(?:-\\s*)?(?:years?|yrs?|anos?)\\b`));
  const months = t.match(new RegExp(`${num}\\s*(?:-\\s*)?(?:months?|m[eê]s(?:es)?)\\b`));
  const value = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : words[raw] ?? NaN);
  const total = years ? value(years[1]) * 12 : months ? value(months[1]) : NaN;
  return Number.isFinite(total) && total >= 1 && total <= 120 ? total : null;
}

export interface WarrantyExpiryInput {
  purchaseDate: string | null;
  deliveryDate?: string | null;
  category?: string | null;
  currency?: string | null;
  purchaseCountry?: string | null;
  merchant?: string | null;
  warranty?: string | null;
  /** Subscriptions, digital purchases, tickets and services have no warranty dates. */
  purchaseType?: string | null;
}

export interface WarrantyExpiries {
  /** Statutory warranty end (PT 3 years, EU 2 years), YYYY-MM-DD or null. */
  legal: string | null;
  /** Manufacturer/contractual warranty end from the receipt text, YYYY-MM-DD or null. */
  manufacturer: string | null;
}

/** Legal warranty start: delivery of the goods (DL 84/2021) when known, else the purchase date. */
function legalStart(input: WarrantyExpiryInput): string | null {
  return isIsoDate(input.purchaseDate) ? returnWindowStart(input.purchaseDate, input.deliveryDate).date : null;
}

export function computeWarrantyExpiries(input: WarrantyExpiryInput): WarrantyExpiries {
  if (hasNoConsumerDates(input.purchaseType)) return { legal: null, manufacturer: null };
  let legal: string | null = null;
  const start = legalStart(input);
  const country = detectCountry({ currency: input.currency, purchaseCountry: input.purchaseCountry, merchant: input.merchant });
  const years = country ? LEGAL_WARRANTY_YEARS[country] : undefined;
  const category = input.category ?? "Other";
  if (start && years && DURABLE_CATEGORIES.has(category)) legal = addYearsClamped(start, years);

  let manufacturer: string | null = null;
  const text = input.warranty ?? null;
  // An explicit end date in the text wins ("Warranty until 2027-05-01"); take the latest one.
  const explicit = (text?.match(ISO_DATE_RE) ?? []).filter(isIsoDate).sort();
  if (explicit.length > 0) {
    manufacturer = explicit[explicit.length - 1];
  } else if (isIsoDate(input.purchaseDate)) {
    const months = parseManufacturerWarrantyMonths(text);
    if (months != null) manufacturer = addMonthsClamped(input.purchaseDate, months);
  }
  return { legal, manufacturer };
}
