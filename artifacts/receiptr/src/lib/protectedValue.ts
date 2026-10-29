import type { Receipt } from "@workspace/api-client-react";
import { deriveConsumerRights } from "./consumerRights";
import { hasNoConsumerDates } from "./purchaseType";

/**
 * Protected value (Stats tab). Read-only view over the receipts the app
 * already has; every figure comes from deriveConsumerRights, the same rules
 * the receipt sheet shows. Amounts are never converted between currencies.
 *
 * - Each receipt counts once, in the bucket whose protection ends first:
 *   Return window while it is open, Warranty after that.
 * - "Return deadline unknown": goods with no derivable deadline. Shown, not counted.
 * - Subscriptions, digital, services and tickets are excluded (purchase_type).
 */
export type Bucket = "return" | "warranty" | "unknown";

export interface ProtectedEntry {
  receiptId: number;
  /** Main item name, else the merchant. */
  title: string;
  merchant: string | null;
  category: string | null;
  currency: string;
  amount: number;
  bucket: Bucket;
  /** Return deadline or (latest) warranty end; null for "unknown". */
  deadline: Date | null;
  daysLeft: number | null;
}

export type ClassifyResult =
  | { kind: "entry"; entry: ProtectedEntry }
  | { kind: "excluded" }   // subscription / digital / service / ticket
  | { kind: "expired" }    // had deadlines, all passed
  | { kind: "none" };      // nothing to count (no total, groceries, processing)

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(today: Date, target: Date): number {
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function mainItemName(r: Receipt): string | null {
  const notable = (r.notableItems ?? []).find((n) => n.name);
  if (notable) return notable.name;
  const products = (r.products ?? []).filter((p) => p.name && (p.price == null || p.price > 0));
  if (products.length === 0) return null;
  return [...products].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0].name;
}

export function classifyReceipt(r: Receipt, now: Date = new Date()): ClassifyResult {
  if (r.status === "processing" || r.status === "not_a_receipt" || r.isDraft) return { kind: "none" };
  if (hasNoConsumerDates(r.purchaseType)) return { kind: "excluded" };
  if (r.total == null || !(r.total > 0)) return { kind: "none" };

  const today = startOfToday(now);
  const rights = deriveConsumerRights({
    purchaseDate: r.purchaseDate,
    deliveryDate: r.deliveryDate,
    category: r.category,
    currency: r.currency,
    purchaseCountry: r.purchaseCountry,
    isOnlinePurchase: r.isOnlinePurchase,
    merchant: r.merchant,
    warrantyText: r.warranty,
    purchaseType: r.purchaseType,
  });

  const base = {
    receiptId: r.id,
    title: mainItemName(r) ?? r.merchant ?? r.originalFileName,
    merchant: r.merchant ?? null,
    category: r.category ?? null,
    currency: (r.currency ?? "EUR").toUpperCase(),
    amount: r.total,
  };

  const rw = rights.returnWindow;
  if (rw && daysBetween(today, rw.deadline) >= 0) {
    return { kind: "entry", entry: { ...base, bucket: "return", deadline: rw.deadline, daysLeft: daysBetween(today, rw.deadline) } };
  }
  const warranties = [rights.warranty?.expiry, rights.manufacturerWarranty?.expiry]
    .filter((d): d is Date => d instanceof Date && daysBetween(today, d) >= 0);
  if (warranties.length > 0) {
    const end = new Date(Math.max(...warranties.map((d) => d.getTime())));
    return { kind: "entry", entry: { ...base, bucket: "warranty", deadline: end, daysLeft: daysBetween(today, end) } };
  }
  if (rw || rights.warranty || rights.manufacturerWarranty) return { kind: "expired" };
  // Groceries never get a deadline (consumables): not "unknown", just nothing to protect.
  if ((r.category ?? "") === "Groceries") return { kind: "none" };
  return { kind: "entry", entry: { ...base, bucket: "unknown", deadline: null, daysLeft: null } };
}

export interface MoneyTotal { currency: string; amount: number }

export interface GroupSummary { count: number; amount: number }

export interface ProtectedSummary {
  receiptCount: number;
  entries: ProtectedEntry[];
  /** return + warranty, sorted by deadline (soonest first). */
  counted: ProtectedEntry[];
  primaryCurrency: string;
  /** Counted total in the primary currency. */
  total: number;
  /** Counted totals in other currencies (never converted). */
  otherTotals: MoneyTotal[];
  groups: Record<Bucket, GroupSummary>;
  excludedCount: number;
  expiredCount: number;
}

function pickPrimaryCurrency(entries: ProtectedEntry[]): string {
  if (entries.length === 0) return "EUR";
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.currency, (counts.get(e.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) =>
    b[1] - a[1] || (a[0] === "EUR" ? -1 : b[0] === "EUR" ? 1 : a[0].localeCompare(b[0])),
  )[0][0];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeProtected(receipts: Receipt[], now: Date = new Date()): ProtectedSummary {
  const entries: ProtectedEntry[] = [];
  let excludedCount = 0;
  let expiredCount = 0;
  for (const r of receipts) {
    const res = classifyReceipt(r, now);
    if (res.kind === "entry") entries.push(res.entry);
    else if (res.kind === "excluded") excludedCount++;
    else if (res.kind === "expired") expiredCount++;
  }
  const counted = entries
    .filter((e) => e.bucket !== "unknown")
    .sort((a, b) => (a.deadline!.getTime() - b.deadline!.getTime()) || b.amount - a.amount);
  const primaryCurrency = pickPrimaryCurrency(counted.length ? counted : entries);

  const totals = new Map<string, number>();
  for (const e of counted) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount);
  const otherTotals = [...totals.entries()]
    .filter(([c]) => c !== primaryCurrency)
    .map(([currency, amount]) => ({ currency, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const group = (bucket: Bucket): GroupSummary => {
    const list = entries.filter((e) => e.bucket === bucket);
    return {
      count: list.length,
      amount: round2(list.filter((e) => e.currency === primaryCurrency).reduce((s, e) => s + e.amount, 0)),
    };
  };

  return {
    receiptCount: receipts.length,
    entries,
    counted,
    primaryCurrency,
    total: round2(totals.get(primaryCurrency) ?? 0),
    otherTotals,
    groups: { return: group("return"), warranty: group("warranty"), unknown: group("unknown") },
    excludedCount,
    expiredCount,
  };
}

export interface ChartBar {
  /** First day of the week bucket. */
  start: Date;
  returnAmount: number;
  warrantyAmount: number;
  /** Month label shown under the first bar of each month. */
  monthLabel: string | null;
}

export interface ExpiringChart {
  days: number;
  bars: ChartBar[];
  total: number;
  returnTotal: number;
  warrantyTotal: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Weekly stacked bars for the next `days` days, primary currency only. */
export function expiringChart(summary: ProtectedSummary, days: 30 | 60 | 90, now: Date = new Date()): ExpiringChart {
  const today = startOfToday(now);
  const weeks = Math.ceil(days / 7);
  const bars: ChartBar[] = [];
  let prevMonth = -1;
  for (let i = 0; i < weeks; i++) {
    const start = new Date(today);
    start.setDate(start.getDate() + i * 7);
    const m = start.getMonth();
    bars.push({ start, returnAmount: 0, warrantyAmount: 0, monthLabel: m !== prevMonth ? MONTHS[m] : null });
    prevMonth = m;
  }
  // A month that only covers the first bar would crowd the next label ("Oct Nov").
  if (bars.length > 1 && bars[1].monthLabel) bars[0].monthLabel = null;
  let returnTotal = 0;
  let warrantyTotal = 0;
  for (const e of summary.counted) {
    if (e.currency !== summary.primaryCurrency || e.daysLeft == null) continue;
    if (e.daysLeft < 0 || e.daysLeft > days) continue;
    const bar = bars[Math.min(Math.floor(e.daysLeft / 7), weeks - 1)];
    if (e.bucket === "return") { bar.returnAmount += e.amount; returnTotal += e.amount; }
    else { bar.warrantyAmount += e.amount; warrantyTotal += e.amount; }
  }
  return {
    days, bars,
    total: round2(returnTotal + warrantyTotal),
    returnTotal: round2(returnTotal),
    warrantyTotal: round2(warrantyTotal),
  };
}

export interface WorthKeepingItem {
  name: string;
  price: number | null;
  category: string | null;
  receiptId: number;
  currency: string | null;
  /** "Return by 6 Nov" / "Warranty to 3 Mar 2028", else the merchant. */
  caption: string | null;
}

/**
 * "Worth keeping" (moved from the home): the notable items of protected
 * receipts, most valuable first, captioned with the protection date. Falls
 * back to the most recent notable items (merchant caption) when none of them
 * is protected.
 */
export function worthKeeping(receipts: Receipt[], summary: ProtectedSummary, now: Date = new Date(), limit = 4): WorthKeepingItem[] {
  const byId = new Map(summary.counted.map((e) => [e.receiptId, e]));
  const protectedItems: WorthKeepingItem[] = [];
  for (const r of receipts) {
    const e = byId.get(r.id);
    if (!e) continue;
    for (const n of r.notableItems ?? []) {
      protectedItems.push({
        name: n.name, price: n.price ?? null, category: n.category ?? r.category ?? null,
        receiptId: r.id, currency: r.currency ?? null,
        caption: protectionCaption(e, now),
      });
    }
  }
  if (protectedItems.length > 0) {
    return protectedItems.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, limit);
  }
  const recent: WorthKeepingItem[] = [];
  for (const r of receipts) {
    if (hasNoConsumerDates(r.purchaseType)) continue;
    for (const n of r.notableItems ?? []) {
      recent.push({
        name: n.name, price: n.price ?? null, category: n.category ?? r.category ?? null,
        receiptId: r.id, currency: r.currency ?? null, caption: r.merchant ?? null,
      });
      if (recent.length >= limit) return recent;
    }
  }
  return recent;
}

/** "30 Oct", with the year when it isn't this year ("3 Mar 2028"). US style: "Oct 30". */
export function formatShortDate(d: Date, now: Date = new Date(), us = false): string {
  const day = d.getDate();
  const mon = MONTHS[d.getMonth()];
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : "";
  return us ? `${mon} ${day}${year ? `,${year}` : ""}` : `${day} ${mon}${year}`;
}

export function protectionCaption(e: Pick<ProtectedEntry, "bucket" | "deadline" | "currency">, now: Date = new Date()): string | null {
  if (!e.deadline) return null;
  const us = e.currency === "USD";
  const date = formatShortDate(e.deadline, now, us);
  return e.bucket === "return" ? `Return by ${date}` : `Warranty to ${date}`;
}

/** Same urgency colours as the receipt sheet: red ≤3 days, amber ≤14 days. */
export function deadlineUrgency(daysLeft: number | null, bucket: Bucket): "red" | "amber" | "none" {
  if (daysLeft == null || bucket === "unknown") return "none";
  if (daysLeft <= 3) return "red";
  if (daysLeft <= 14) return "amber";
  return "none";
}

/** "€2,431.80" / "$349.00"; never converted. */
export function formatAmount(amount: number, currency: string | null | undefined): string {
  const c = (currency ?? "EUR").toUpperCase();
  const sym = c === "EUR" ? "\u20AC" : c === "USD" ? "$" : c === "GBP" ? "\u00A3" : c === "BRL" ? "R$" : `${c} `;
  return `${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
