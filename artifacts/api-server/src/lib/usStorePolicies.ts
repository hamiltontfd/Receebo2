/**
 * US store return policies for US-region accounts (US mode, 29 Oct 2026).
 *
 * KEEP IN SYNC: this file is byte-identical in
 *   artifacts/api-server/src/lib/usStorePolicies.ts and
 *   artifacts/receiptr/src/lib/usStorePolicies.ts
 * (a test fails if they differ). Pure, no imports.
 *
 * Source: /workspace/receebo/us-store-coverage.md (8 stores, each official
 * page opened on 27 Oct 2026) and us-return-policies.json. Hamilton's rules:
 * - a store not in this table (and eBay/Etsy, always) is "unknown": never an
 *   estimated 30 days;
 * - only the standard window (no member tiers, no state rules): the shortest,
 *   so the safest;
 * - the window applies to online AND in-store purchases;
 * - the user's own number (receipts.return_days) always wins over this table.
 */

export type UsItemKind =
  | "apple" | "phone" | "major_appliance" | "tv" | "computer" | "wearable_camera_drone"
  | "climate" | "furniture" | "electronics";

export interface UsPolicyException {
  kinds: UsItemKind[];
  days: number;
  label: string;
}

export interface UsHolidayRule {
  purchaseFrom: string;
  purchaseTo: string;
  returnBy: string;
  /** Item kinds the extension does not cover. */
  excludeKinds?: UsItemKind[];
  /** Different return-by date for some kinds (Amazon: Apple products until Jan 15). */
  kindReturnBy?: Partial<Record<UsItemKind, string>>;
}

export interface UsStorePolicy {
  key: string;
  name: string;
  /** null = no fixed window for most items (Costco satisfaction guarantee). */
  defaultDays: number | null;
  /** "delivery": counts from the day the customer receives it (in store = the purchase date). */
  startsFrom: "delivery" | "purchase";
  /** First matching exception wins for an item; the receipt uses its shortest item. */
  exceptions: UsPolicyException[];
  holiday: UsHolidayRule | null;
  sourceUrl: string;
  checkedOn: string;
}

export const US_POLICIES_CHECKED_ON = "2026-10-27";

export const US_STORE_POLICIES: UsStorePolicy[] = [
  {
    key: "amazon", name: "Amazon", defaultDays: 30, startsFrom: "delivery",
    exceptions: [{ kinds: ["apple"], days: 15, label: "Apple products" }],
    holiday: { purchaseFrom: "2026-11-01", purchaseTo: "2026-12-31", returnBy: "2027-01-31", kindReturnBy: { apple: "2027-01-15" } },
    sourceUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7", checkedOn: "2026-10-27",
  },
  {
    key: "walmart", name: "Walmart", defaultDays: 90, startsFrom: "delivery",
    exceptions: [
      { kinds: ["major_appliance"], days: 2, label: "major appliances" },
      { kinds: ["phone"], days: 14, label: "cell phones" },
      { kinds: ["electronics", "computer", "tv", "apple", "climate", "wearable_camera_drone"], days: 30, label: "electronics" },
    ],
    holiday: { purchaseFrom: "2026-10-01", purchaseTo: "2026-12-31", returnBy: "2027-01-31", excludeKinds: ["phone", "major_appliance"] },
    sourceUrl: "https://corporate.walmart.com/policies", checkedOn: "2026-10-27",
  },
  {
    key: "target", name: "Target", defaultDays: 90, startsFrom: "purchase",
    exceptions: [
      { kinds: ["apple", "phone"], days: 14, label: "Apple, Beats and cell phones" },
      { kinds: ["electronics", "computer", "tv", "wearable_camera_drone"], days: 30, label: "electronics" },
    ],
    holiday: null,
    sourceUrl: "https://help.target.com/help/subcategoryarticle?childcat=Returns&parentcat=Returns+%26+Exchanges", checkedOn: "2026-10-27",
  },
  {
    key: "bestbuy", name: "Best Buy", defaultDays: 15, startsFrom: "delivery",
    exceptions: [{ kinds: ["phone"], days: 14, label: "activatable devices" }],
    holiday: { purchaseFrom: "2026-10-30", purchaseTo: "2026-12-31", returnBy: "2027-01-15" },
    sourceUrl: "https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c?id=pcmcat260800050014", checkedOn: "2026-10-27",
  },
  {
    key: "costco", name: "Costco", defaultDays: null, startsFrom: "delivery",
    exceptions: [{ kinds: ["tv", "major_appliance", "computer", "apple", "phone", "wearable_camera_drone"], days: 90, label: "TVs, major appliances, computers, tablets, phones, smartwatches, cameras and drones" }],
    holiday: null,
    sourceUrl: "https://customerservice.costco.com/app/answers/answer_view/a_id/1191", checkedOn: "2026-10-27",
  },
  {
    key: "homedepot", name: "The Home Depot", defaultDays: 90, startsFrom: "purchase",
    exceptions: [
      { kinds: ["major_appliance"], days: 2, label: "major appliances" },
      { kinds: ["climate"], days: 7, label: "air conditioners, dehumidifiers, generators and heaters" },
      { kinds: ["tv", "computer", "apple", "furniture"], days: 30, label: "TVs, computers and furniture" },
    ],
    holiday: null,
    sourceUrl: "https://www.homedepot.com/c/Return_Policy", checkedOn: "2026-10-27",
  },
  {
    key: "apple", name: "Apple", defaultDays: 14, startsFrom: "delivery",
    exceptions: [],
    holiday: null,
    sourceUrl: "https://www.apple.com/shop/help/returns_refund", checkedOn: "2026-10-27",
  },
  {
    key: "macys", name: "Macy's", defaultDays: 30, startsFrom: "delivery",
    exceptions: [],
    holiday: { purchaseFrom: "2026-10-05", purchaseTo: "2026-12-31", returnBy: "2027-01-31" },
    sourceUrl: "https://www.macys.com/s/customer-service/what-is-macys-return-policy", checkedOn: "2026-10-27",
  },
];

/** Never matched: the window depends on each seller. */
const ALWAYS_UNKNOWN = /\bebay\b|\betsy\b/;

const STORE_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "amazon", re: /\bamazon\b|\bamzn\b/ },
  { key: "walmart", re: /\bwal ?mart\b|\bwm supercenter\b/ },
  { key: "target", re: /^target\b|\btarget com\b|\btarget store\b/ },
  { key: "bestbuy", re: /\bbest ?buy\b|\bbby\b/ },
  { key: "costco", re: /\bcostco\b/ },
  { key: "homedepot", re: /\bhome ?depot\b/ },
  { key: "apple", re: /^apple( inc| store| online store| com( us)?| r\d+)?$|\bapple store\b|\bapple com\b/ },
  { key: "macys", re: /\bmacy ?s\b|\bmacys\b/ },
];

function normalizeMerchant(merchant: string): string {
  return merchant.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function findUsStorePolicy(merchant: string | null | undefined): UsStorePolicy | null {
  if (!merchant) return null;
  const m = normalizeMerchant(merchant);
  if (!m || ALWAYS_UNKNOWN.test(m)) return null;
  const hit = STORE_PATTERNS.find((p) => p.re.test(m));
  return hit ? US_STORE_POLICIES.find((p) => p.key === hit.key) ?? null : null;
}

const KIND_PATTERNS: Array<{ kind: UsItemKind; re: RegExp; not?: RegExp }> = [
  { kind: "apple", re: /\b(iphone|ipad|macbook|imac|mac ?mini|mac ?studio|airpods?|apple ?watch|apple ?tv|homepod|beats)\b/ },
  { kind: "phone", re: /\b(iphone|smartphones?|cell ?phones?|mobile ?phones?|galaxy ?(s|z|a)\s?\d+|pixel ?\d+[a-z]?\b|moto ?g)\b/ },
  {
    kind: "major_appliance",
    re: /\b(refrigerators?|fridges?|freezers?|washers?|washing machines?|dryers?|dishwashers?|cooktops?|wall ovens?|(gas|electric|induction|dual fuel) ranges?|over the range microwave|built in microwave)\b/,
    not: /\b(hair ?dryer|pressure ?washer|mini ?fridge|salad ?dryer|toaster)\b/,
  },
  { kind: "tv", re: /\b(tvs?|televisions?|oled|qled|projectors?)\b/, not: /\btv ?(wall ?)?(stands?|mounts?|brackets?|cabinets?|consoles?|antennas?|remotes?)\b|\b(mounts?|stands?|brackets?) for tvs?\b/ },
  { kind: "computer", re: /\b(laptops?|notebook computers?|macbook|desktop( computer| pc)?|computers?|chromebooks?|pcs?|tablets?|ipad)\b/ },
  { kind: "wearable_camera_drone", re: /\b(smart ?watch(es)?|apple ?watch|cameras?|drones?|camcorders?)\b/ },
  { kind: "climate", re: /\b(air ?conditioners?|dehumidifiers?|generators?|space ?heaters?|portable ?heaters?)\b/ },
  { kind: "furniture", re: /\b(sofas?|couch(es)?|sectionals?|recliners?|mattress(es)?|dressers?|bookcases?|bed ?frames?)\b/ },
];

/** Item kinds named in a product line ("Apple iPhone 16 128GB" -> apple, phone). */
export function usItemKinds(name: string): UsItemKind[] {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const kinds = KIND_PATTERNS.filter((k) => k.re.test(n) && !(k.not && k.not.test(n))).map((k) => k.kind);
  if (kinds.some((k) => k === "apple" || k === "phone" || k === "tv" || k === "computer" || k === "wearable_camera_drone")) kinds.push("electronics");
  return kinds;
}

export interface UsReturnInput {
  merchant?: string | null;
  /** YYYY-MM-DD */
  purchaseDate: string;
  deliveryDate?: string | null;
  isOnlinePurchase?: boolean | null;
  category?: string | null;
  /** Product and notable-item names. */
  itemNames?: ReadonlyArray<string | null | undefined> | null;
}

export type UsReturnSuggestion =
  | { status: "unknown" }
  | { status: "no_fixed_window"; store: UsStorePolicy }
  | {
      status: "window";
      store: UsStorePolicy;
      /** Policy length in days for the item it applied to. */
      days: number;
      startsFrom: "delivery" | "purchase";
      /** YYYY-MM-DD */
      deadline: string;
      /** "standard" or the exception's label ("Apple products"). */
      rule: string;
      /** The holiday extension moved the deadline later. */
      holiday: boolean;
    };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v: string | null | undefined): v is string => !!v && ISO.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Start of a US return window: the delivery date when the purchase was not
 * explicitly in store and the date is valid (not before the purchase);
 * otherwise the purchase date. In store, the day you buy is the day you receive.
 */
export function usReturnStart(input: Pick<UsReturnInput, "purchaseDate" | "deliveryDate" | "isOnlinePurchase">, policyStartsFrom: "delivery" | "purchase" = "delivery"): { date: string; from: "delivery" | "purchase" } {
  if (policyStartsFrom === "delivery" && input.isOnlinePurchase !== false && isIso(input.deliveryDate) && input.deliveryDate >= input.purchaseDate) {
    return { date: input.deliveryDate, from: "delivery" };
  }
  return { date: input.purchaseDate, from: "purchase" };
}

/** Store-table return window for a US account's receipt. Online and in store alike. */
export function usStoreReturnWindow(input: UsReturnInput): UsReturnSuggestion {
  if (!isIso(input.purchaseDate)) return { status: "unknown" };
  const store = findUsStorePolicy(input.merchant);
  if (!store) return { status: "unknown" };

  const names = (input.itemNames ?? []).filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  const itemKinds = names.map(usItemKinds);
  // No recognisable item: fall back to the receipt category.
  if (itemKinds.every((k) => k.length === 0)) itemKinds.splice(0, itemKinds.length, input.category === "Electronics" ? ["electronics"] : []);

  let best: { days: number | null; rule: string; kinds: UsItemKind[] } | null = null;
  for (const kinds of itemKinds) {
    const exception = store.exceptions.find((e) => e.kinds.some((k) => kinds.includes(k)));
    const days = exception ? exception.days : store.defaultDays;
    const rule = exception ? exception.label : "standard";
    if (days == null) continue;
    if (!best || best.days == null || days < best.days) best = { days, rule, kinds };
  }
  if (!best || best.days == null) return { status: "no_fixed_window", store };

  const start = usReturnStart(input, store.startsFrom);
  let deadline = addDaysIso(start.date, best.days);
  let holiday = false;
  const h = store.holiday;
  if (h && input.purchaseDate >= h.purchaseFrom && input.purchaseDate <= h.purchaseTo &&
      !best.kinds.some((k) => h.excludeKinds?.includes(k))) {
    const kindDate = best.kinds.map((k) => h.kindReturnBy?.[k]).find(Boolean);
    const returnBy = kindDate ?? h.returnBy;
    if (returnBy > deadline) {
      deadline = returnBy;
      holiday = true;
    }
  }
  return { status: "window", store, days: best.days, startsFrom: start.from, deadline, rule: best.rule, holiday };
}
