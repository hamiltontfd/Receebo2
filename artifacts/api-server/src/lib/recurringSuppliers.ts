/**
 * Recurring suppliers: "approve once" for subscriptions and utility bills
 * found in email (Designer spec /workspace/receebo/mockups-recurring/SPEC.md).
 *
 * Identity: a normalised supplier key. Known brands map to one key
 * ("EDP Comercial" and "EDP Comercial – Comercialização de Energia, S.A." are
 * both "edp"); other merchants use their name without legal suffixes or the
 * part after a dash/comma; with no merchant, the sender's domain.
 *
 * Recurring when (any item from that supplier, pending or in the library):
 *   - utility: a known utility/telecom brand or sender domain, or bill wording
 *     (electricity, natural gas, water supply, telecoms…);
 *   - subscription: purchase type "subscription", a known subscription brand,
 *     or the same supplier charging a similar amount (±25% of the median) in
 *     3 or more different months.
 *
 * Decisions (recurring_suppliers): on = import automatically ("Always
 * import" in the pending sheet/home card, or the Profile switch), off = stop
 * importing (Profile switch only); no row = undecided. Dismissing a pending
 * receipt never changes the decision.
 */
import { sql, and, eq } from "drizzle-orm";
import {
  db, pendingImportsTable, receiptsTable, recurringSuppliersTable,
  type PendingImportExtractionData, type RecurringSupplierRow,
} from "@workspace/db";
import { senderDomain as domainOfSender } from "./mailProviders/merchants";

export type SupplierKind = "subscription" | "utility";
export type SupplierDecision = "on" | "off";
export type SupplierStatus = SupplierDecision | "undecided";
export const SUPPLIER_DECISIONS: readonly SupplierDecision[] = ["on", "off"];

/** Idempotent startup migration (same pattern as lib/receiptColumns.ts). */
export async function migrateRecurringSuppliers(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS recurring_suppliers (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      supplier_key text NOT NULL,
      display_name text NOT NULL,
      kind text NOT NULL,
      status text NOT NULL,
      category text,
      sender_domains text[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT recurring_suppliers_user_key_unique UNIQUE (user_id, supplier_key)
    );
    CREATE INDEX IF NOT EXISTS recurring_suppliers_user_idx ON recurring_suppliers(user_id);
  `);
}

// ── Identity ────────────────────────────────────────────────────────────────

interface Brand { key: string; kind: SupplierKind; name: RegExp; domains: string[] }

/** Known brands: one key for all their names, and their sender domains. */
const BRANDS: Brand[] = [
  // Utilities and telecoms (PT)
  { key: "edp", kind: "utility", name: /^edp\b/i, domains: ["edp.pt", "edp.com"] },
  { key: "e-redes", kind: "utility", name: /^e-?redes\b/i, domains: ["e-redes.pt"] },
  { key: "galp", kind: "utility", name: /^galp\b/i, domains: ["galp.pt", "galp.com", "galpenergia.com"] },
  { key: "endesa", kind: "utility", name: /^endesa\b/i, domains: ["endesa.pt"] },
  { key: "iberdrola", kind: "utility", name: /^iberdrola\b/i, domains: ["iberdrola.pt"] },
  { key: "goldenergy", kind: "utility", name: /^goldenergy\b/i, domains: ["goldenergy.pt"] },
  { key: "epal", kind: "utility", name: /^epal\b/i, domains: ["epal.pt"] },
  { key: "meo", kind: "utility", name: /^(meo|altice)\b/i, domains: ["meo.pt", "telecom.pt", "altice.pt"] },
  { key: "nos", kind: "utility", name: /^nos(\s+comunica[cç][oõ]es)?(\s|,|$)/i, domains: ["nos.pt"] },
  { key: "vodafone", kind: "utility", name: /^vodafone\b/i, domains: ["vodafone.pt"] },
  { key: "nowo", kind: "utility", name: /^nowo\b/i, domains: ["nowo.pt"] },
  { key: "digi", kind: "utility", name: /^digi\b/i, domains: ["digi.pt"] },
  // Services that only exist as subscriptions
  { key: "netflix", kind: "subscription", name: /^netflix\b/i, domains: ["netflix.com"] },
  { key: "spotify", kind: "subscription", name: /^spotify\b/i, domains: ["spotify.com"] },
  { key: "disney-plus", kind: "subscription", name: /^disney\s*(\+|plus)/i, domains: ["disneyplus.com"] },
  { key: "hbo-max", kind: "subscription", name: /^hbo\b/i, domains: ["hbomax.com", "max.com"] },
  { key: "dropbox", kind: "subscription", name: /^dropbox\b/i, domains: ["dropbox.com"] },
];

/** Webmail, marketplaces and payment platforms: a sender domain that says nothing about the supplier. */
const SHARED_DOMAINS = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com",
  "yahoo.com", "sapo.pt", "apple.com", "google.com", "microsoft.com", "paypal.com", "paypal.pt", "stripe.com",
  "amazon.com", "amazon.es", "amazon.de", "amazon.fr", "amazon.co.uk", "amazon.it", "ebay.com", "ebay.es",
  "aliexpress.com", "shopify.com", "mailchimp.com", "sendgrid.net", "amazonses.com",
];

const LEGAL_SUFFIX = /[\s,]+(s\.?\s?a\.?|lda\.?|limitada|unipessoal|inc\.?|ltd\.?|llc|gmbh|s\.?l\.?|b\.?v\.?|plc|sarl|s\.?p\.?a\.?|ag|co\.?)\s*$/i;
const GENERIC_TAIL = new Set(["international", "portugal", "pt", "europe", "eu", "iberia", "services", "servicos", "online", "store", "global"]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Last two labels, or three for second-level registries (example.com.pt, example.co.uk). */
export function registrableDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const second = labels[labels.length - 2]!;
  const take = labels.length >= 3 && /^(com|co|org|net|gov|edu|ac)$/.test(second) && labels[labels.length - 1]!.length === 2 ? 3 : 2;
  return labels.slice(-take).join(".");
}

export function isSharedDomain(domain: string | null | undefined): boolean {
  const d = registrableDomain(domain);
  return !d || SHARED_DOMAINS.includes(d) || /^amazon\./.test(d) || /^ebay\./.test(d);
}

function brandByName(name: string | null | undefined): Brand | null {
  const n = name?.trim();
  return n ? BRANDS.find((b) => b.name.test(n)) ?? null : null;
}

function brandByDomain(domain: string | null | undefined): Brand | null {
  const d = registrableDomain(domain);
  return d ? BRANDS.find((b) => b.domains.includes(d)) ?? null : null;
}

/** "EDP Comercial – Comercialização de Energia, S.A." → "EDP Comercial". */
export function shortSupplierName(merchant: string | null | undefined): string | null {
  let name = (merchant ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  name = name.split(/\s[–—-]\s|,|\(|\|/)[0]!.trim() || name;
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(name); i++) name = name.replace(LEGAL_SUFFIX, "").trim();
  return name || null;
}

/** Normalised supplier identity; null when there is neither a merchant nor a useful sender. */
export function supplierKey(merchant: string | null | undefined, senderDomain?: string | null): string | null {
  const brand = brandByName(merchant) ?? (merchant ? null : brandByDomain(senderDomain));
  if (brand) return brand.key;
  const short = shortSupplierName(merchant);
  if (short) {
    const words = stripAccents(short).toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean)
      .map((w) => w.replace(/\+/g, "-plus"));
    while (words.length > 1 && GENERIC_TAIL.has(words[words.length - 1]!)) words.pop();
    const key = words.slice(0, 4).join("-").replace(/-+/g, "-");
    if (key) return key;
  }
  return senderDomain && !isSharedDomain(senderDomain) ? registrableDomain(senderDomain) : null;
}

// ── Detection ───────────────────────────────────────────────────────────────

export interface SupplierItem {
  source: "receipt" | "pending";
  id: number;
  merchant: string | null;
  purchaseType: string | null;
  category: string | null;
  summary: string | null;
  productNames: string[];
  senderDomain: string | null;
  purchaseDate: string | null;
  total: number | null;
  currency: string | null;
}

const UTILITY_TEXT =
  /\b(electricity|eletricidade|electricidade|energia el[eé]trica|g[aá]s natural|natural gas|fornecimento de [aá]gua|abastecimento de [aá]gua|[aá]gua e saneamento|water (supply|bill)|fatura de (luz|g[aá]s|[aá]gua|eletricidade)|telecomunica[cç][oõ]es|internet e tv|fibra [oó]tica|mobile plan|tarif[aá]rio m[oó]vel)\b/i;
const UTILITY_MERCHANT = /^([aá]guas d[eo]s?\b|smas\b|servi[cç]os municipalizados)/i;

/** Same supplier, similar amount, 3+ different months. */
export function looksRepeated(items: readonly Pick<SupplierItem, "purchaseDate" | "total">[]): boolean {
  const dated = items.filter((i) => i.purchaseDate && typeof i.total === "number" && i.total > 0);
  const months = new Set(dated.map((i) => i.purchaseDate!.slice(0, 7)));
  if (months.size < 3) return false;
  const totals = dated.map((i) => i.total!).sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)]!;
  return totals.every((t) => Math.abs(t - median) <= median * 0.25);
}

export function recurringKind(key: string, items: readonly SupplierItem[]): SupplierKind | null {
  const brand = BRANDS.find((b) => b.key === key) ?? null;
  const utility = brand?.kind === "utility" ||
    items.some((i) => brandByDomain(i.senderDomain)?.kind === "utility" ||
      UTILITY_MERCHANT.test(i.merchant ?? "") ||
      UTILITY_TEXT.test([i.summary, ...i.productNames].filter(Boolean).join("\n")));
  if (utility) return "utility";
  if (brand?.kind === "subscription" || items.some((i) => i.purchaseType === "subscription") || looksRepeated(items)) {
    return "subscription";
  }
  return null;
}

// ── Overview (Profile list, pending prompt) ─────────────────────────────────

export interface SupplierView {
  supplierKey: string;
  displayName: string;
  kind: SupplierKind;
  category: string;
  status: SupplierStatus;
  /** Receipts already in the library. */
  receiptCount: number;
  lastReceiptDate: string | null;
  lastAmount: number | null;
  lastCurrency: string | null;
  /** Pending imports from this supplier. */
  pendingCount: number;
  pendingIds: number[];
}

type PendingLike = { id: number; extractionData: PendingImportExtractionData | null };

export function pendingSupplierItem(row: PendingLike): SupplierItem | null {
  const d = row.extractionData;
  if (!d) return null;
  return {
    source: "pending", id: row.id, merchant: d.merchant, purchaseType: d.purchaseType ?? null,
    category: d.category, summary: d.summary, productNames: (d.products ?? []).map((p) => p.name),
    senderDomain: d.senderDomain ?? null, purchaseDate: d.purchaseDate, total: d.total, currency: d.currency,
  };
}

export function pendingSupplierKey(row: PendingLike): string | null {
  const d = row.extractionData;
  return d ? supplierKey(d.merchant, d.senderDomain) : null;
}

/** Pure grouping (tested without a DB). */
export function buildSupplierViews(
  items: readonly SupplierItem[],
  rows: readonly Pick<RecurringSupplierRow, "supplierKey" | "displayName" | "kind" | "status" | "category">[],
): Map<string, SupplierView> {
  const groups = new Map<string, SupplierItem[]>();
  for (const item of items) {
    const key = supplierKey(item.merchant, item.senderDomain);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const byKey = new Map(rows.map((r) => [r.supplierKey, r]));
  const views = new Map<string, SupplierView>();
  for (const key of new Set([...groups.keys(), ...byKey.keys()])) {
    const group = groups.get(key) ?? [];
    const row = byKey.get(key);
    const kind = (row?.kind as SupplierKind | undefined) ?? recurringKind(key, group);
    if (!kind) continue;
    const names = group.map((i) => shortSupplierName(i.merchant)).filter((n): n is string => Boolean(n));
    const byDate = [...group].sort((a, b) => (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? "") || b.id - a.id);
    const receipts = byDate.filter((i) => i.source === "receipt");
    const last = receipts[0] ?? byDate[0];
    views.set(key, {
      supplierKey: key,
      displayName: row?.displayName ?? names.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? key,
      kind,
      category: row?.category ?? last?.category ?? "Other",
      status: (row?.status as SupplierDecision | undefined) ?? "undecided",
      receiptCount: receipts.length,
      lastReceiptDate: last?.purchaseDate ?? null,
      lastAmount: last?.total ?? null,
      lastCurrency: last?.currency ?? null,
      pendingCount: group.filter((i) => i.source === "pending").length,
      pendingIds: group.filter((i) => i.source === "pending").map((i) => i.id),
    });
  }
  return views;
}

/** On first, then most recent receipt. */
export function sortSupplierViews(views: Iterable<SupplierView>): SupplierView[] {
  return [...views].sort((a, b) =>
    Number(b.status === "on") - Number(a.status === "on") ||
    (b.lastReceiptDate ?? "").localeCompare(a.lastReceiptDate ?? "") ||
    a.displayName.localeCompare(b.displayName));
}

export async function loadSupplierRows(userId: string): Promise<RecurringSupplierRow[]> {
  return db.select().from(recurringSuppliersTable).where(eq(recurringSuppliersTable.userId, userId));
}

/** Everything the UI needs, from the user's receipts, pending imports and decisions. */
export async function loadSupplierOverview(
  userId: string,
  pendingRows?: readonly PendingLike[],
): Promise<Map<string, SupplierView>> {
  const [rows, receipts, pendings] = await Promise.all([
    loadSupplierRows(userId),
    db.select({
      id: receiptsTable.id, merchant: receiptsTable.merchant, purchaseType: receiptsTable.purchaseType,
      category: receiptsTable.category, summary: receiptsTable.summary, purchaseDate: receiptsTable.purchaseDate,
      total: receiptsTable.total, currency: receiptsTable.currency,
    }).from(receiptsTable).where(and(
      eq(receiptsTable.userId, userId), eq(receiptsTable.status, "completed"), eq(receiptsTable.isDraft, false),
    )),
    pendingRows ?? db.select({ id: pendingImportsTable.id, extractionData: pendingImportsTable.extractionData })
      .from(pendingImportsTable)
      .where(and(eq(pendingImportsTable.userId, userId), eq(pendingImportsTable.status, "pending"))),
  ]);
  const items: SupplierItem[] = [
    ...receipts.map((r) => ({
      source: "receipt" as const, id: r.id, merchant: r.merchant, purchaseType: r.purchaseType,
      category: r.category, summary: r.summary, productNames: [], senderDomain: null,
      purchaseDate: r.purchaseDate, total: r.total, currency: r.currency,
    })),
    ...pendings.map(pendingSupplierItem).filter((i): i is SupplierItem => i !== null),
  ];
  return buildSupplierViews(items, rows);
}

/** Domains worth remembering for a supplier: its brand's, plus non-shared sender domains seen. */
function domainsFor(key: string, seen: Array<string | null | undefined>, existing: readonly string[] = []): string[] {
  const brand = BRANDS.find((b) => b.key === key);
  const learned = seen.filter((d) => d && !isSharedDomain(d)).map((d) => registrableDomain(d)!);
  return [...new Set([...existing, ...(brand?.domains ?? []), ...learned])];
}

/** Insert or update the user's decision for a detected supplier. */
export async function saveSupplierDecision(
  userId: string,
  view: Pick<SupplierView, "supplierKey" | "displayName" | "kind">,
  status: SupplierDecision,
  options: { category?: string | null; senderDomains?: Array<string | null | undefined> } = {},
): Promise<RecurringSupplierRow> {
  const [existing] = await db.select().from(recurringSuppliersTable).where(and(
    eq(recurringSuppliersTable.userId, userId), eq(recurringSuppliersTable.supplierKey, view.supplierKey)));
  const senderDomains = domainsFor(view.supplierKey, options.senderDomains ?? [], existing?.senderDomains ?? []);
  const values = {
    displayName: existing?.displayName ?? view.displayName,
    kind: existing?.kind ?? view.kind,
    status,
    senderDomains,
    updatedAt: new Date(),
    ...(options.category !== undefined ? { category: options.category } : {}),
  };
  const [row] = await db.insert(recurringSuppliersTable)
    .values({ userId, supplierKey: view.supplierKey, ...values })
    .onConflictDoUpdate({ target: [recurringSuppliersTable.userId, recurringSuppliersTable.supplierKey], set: values })
    .returning();
  return row!;
}

/** Remember a newly seen sender domain for a supplier (auto-imports). */
export async function rememberSupplierDomain(row: RecurringSupplierRow, domain: string | null | undefined): Promise<void> {
  const next = domainsFor(row.supplierKey, [domain], row.senderDomains);
  if (next.length === row.senderDomains.length) return;
  await db.update(recurringSuppliersTable).set({ senderDomains: next, updatedAt: new Date() })
    .where(eq(recurringSuppliersTable.id, row.id));
}

// ── Mail sync rules ─────────────────────────────────────────────────────────

export interface SupplierRules {
  /** Decision for a sender before any AI call (domain or brand name of the sender), or null. */
  forSender(from: string | null | undefined): RecurringSupplierRow | null;
  /** Decision for an extracted receipt (merchant key, else sender). */
  forReceipt(merchant: string | null | undefined, senderDomain: string | null | undefined): RecurringSupplierRow | null;
}

function senderDisplayName(from: string | null | undefined): string {
  if (!from) return "";
  const i = from.indexOf("<");
  return (i > 0 ? from.slice(0, i) : "").replace(/["']/g, "").trim();
}

export function buildSupplierRules(rows: readonly RecurringSupplierRow[]): SupplierRules {
  const decided = rows.filter((r) => r.status === "on" || r.status === "off");
  const forSender = (from: string | null | undefined) => {
    const domain = registrableDomain(domainOfSender(from));
    if (domain && !isSharedDomain(domain)) {
      const hit = decided.find((r) => r.senderDomains.includes(domain));
      if (hit) return hit;
    }
    const brand = brandByName(senderDisplayName(from));
    return brand ? decided.find((r) => r.supplierKey === brand.key) ?? null : null;
  };
  return {
    forSender,
    forReceipt(merchant, senderDomain) {
      const key = supplierKey(merchant, senderDomain);
      return (key ? decided.find((r) => r.supplierKey === key) : undefined) ??
        (senderDomain ? forSender(`<x@${senderDomain}>`) : null);
    },
  };
}

export async function loadSupplierRules(userId: string): Promise<SupplierRules> {
  return buildSupplierRules(await loadSupplierRows(userId));
}
