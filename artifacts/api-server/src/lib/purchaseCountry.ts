import { countries } from "countries-list";
import { isOnlineForConsumerRights } from "@workspace/api-zod";

/** Account markets and pseudo regions (EU, XX) are not countries. */
export function validPurchaseCountry(value: unknown): boolean {
  return value === null || value === undefined ||
    (typeof value === "string" && Object.hasOwn(countries, value));
}

/** ISO country, or null. "UK" is stored as GB. Markets such as EU are rejected. */
export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (code === "UK") return "GB";
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return Object.hasOwn(countries, code) ? code : null;
}

/**
 * Second-level suffixes whose country is not the last label
 * (`amazon.com.br` is BR, `amazon.co.uk` is GB).
 */
const COMPOUND_STORE_SUFFIX: Record<string, string> = {
  "com.br": "BR",
  "co.uk": "GB",
  "org.uk": "GB",
  "com.au": "AU",
  "co.jp": "JP",
  "com.mx": "MX",
  "com.be": "BE",
  "com.tr": "TR",
  "co.za": "ZA",
  "com.ar": "AR",
  "com.pt": "PT",
  "co.nz": "NZ",
  "com.sg": "SG",
  "com.co": "CO",
  "com.pe": "PE",
  "com.sa": "SA",
  "co.kr": "KR",
  "com.tw": "TW",
  "com.hk": "HK",
  "com.my": "MY",
  "com.ph": "PH",
};

/**
 * Country of a storefront hostname. `amazon.es` is ES, `amazon.com.br` is BR,
 * `amazon.com` is US. Any other `.com` is not a country: the seller's seat
 * remains the fallback. A full URL or an email address is accepted.
 */
export function countryFromStoreDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  let host = domain.trim().toLowerCase();
  const email = host.match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  if (email) host = email[1]!;
  else {
    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    host = (host.split(/[/?#\s]/)[0] ?? "").replace(/:\d+$/, "").replace(/\.$/, "");
    if (host.startsWith("www.")) host = host.slice(4);
  }
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  if (COMPOUND_STORE_SUFFIX[lastTwo]) return COMPOUND_STORE_SUFFIX[lastTwo];
  const tld = labels[labels.length - 1]!;
  if (tld === "com") return labels[labels.length - 2] === "amazon" ? "US" : null;
  if (tld === "uk") return "GB";
  return normalizeCountryCode(tld);
}

export type PurchaseCountryInput = {
  /** true only for a distance / online purchase. In-store and unknown keep purchaseCountry. */
  isOnlinePurchase: boolean | null;
  /** Country inferred for an in-store purchase. Online, used only when the three signals are missing. */
  purchaseCountry: string | null;
  /** Country of the delivery address printed on the receipt, invoice or email. */
  deliveryCountry: string | null;
  /** Storefront hostname, such as amazon.es. */
  storeDomain: string | null;
  /** Country of the seller's registered office. */
  sellerCountry: string | null;
  savedCountry?: string | null;
  merchant?: string | null;
};

/**
 * Country whose return-window and legal-warranty rules apply.
 * Online (including inferred Amazon): delivery, stored purchase country,
 * saved user country, store domain, then seller seat. Never rewrites old receipts.
 * In-store and unknown channel: the extracted purchase country, unchanged.
 */
export function resolvePurchaseCountry(input: PurchaseCountryInput): string | null {
  const inferred = normalizeCountryCode(input.purchaseCountry);
  if (!isOnlineForConsumerRights(input.isOnlinePurchase, input.merchant, input.storeDomain)) return inferred;
  return normalizeCountryCode(input.deliveryCountry)
    ?? inferred
    ?? normalizeCountryCode(input.savedCountry)
    ?? countryFromStoreDomain(input.storeDomain)
    ?? normalizeCountryCode(input.sellerCountry);
}
