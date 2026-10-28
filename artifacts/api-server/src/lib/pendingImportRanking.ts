import type { PendingImportExtractionData } from "@workspace/db";
import { DURABLE_RANKING_CATEGORIES } from "./categories";

/** The fields of a pending_imports row the ranking and list views need. */
export interface RankablePendingImport {
  id: number;
  createdAt: Date;
  extractionData: PendingImportExtractionData | null;
}

function hasNotableItems(data: PendingImportExtractionData | null): boolean {
  return (data?.notableItems?.length ?? 0) > 0;
}

function hasDurableCategory(data: PendingImportExtractionData | null): boolean {
  return !!data?.category && DURABLE_RANKING_CATEGORIES.has(data.category);
}

function purchaseTime(row: RankablePendingImport): number {
  const date = row.extractionData?.purchaseDate;
  const parsed = date ? Date.parse(`${date}T00:00:00Z`) : NaN;
  return Number.isNaN(parsed) ? row.createdAt.getTime() : parsed;
}

/**
 * "Worth keeping first" order for pending email imports:
 * 1. has notableItems (durable goods the AI flagged),
 * 2. durable category (Electronics, Home, Clothing & Apparel),
 * 3. highest total (missing totals last),
 * 4. most recent purchase (then most recently found, then id).
 * Totals in different currencies are compared as plain numbers.
 */
export function comparePendingImports(a: RankablePendingImport, b: RankablePendingImport): number {
  const notable = Number(hasNotableItems(b.extractionData)) - Number(hasNotableItems(a.extractionData));
  if (notable !== 0) return notable;
  const durable = Number(hasDurableCategory(b.extractionData)) - Number(hasDurableCategory(a.extractionData));
  if (durable !== 0) return durable;
  const totalA = a.extractionData?.total ?? null;
  const totalB = b.extractionData?.total ?? null;
  if (totalA !== totalB) {
    if (totalA === null) return 1;
    if (totalB === null) return -1;
    return totalB - totalA;
  }
  const recent = purchaseTime(b) - purchaseTime(a);
  if (recent !== 0) return recent;
  const found = b.createdAt.getTime() - a.createdAt.getTime();
  if (found !== 0) return found;
  return b.id - a.id;
}

export function rankPendingImports<T extends RankablePendingImport>(rows: readonly T[]): T[] {
  return [...rows].sort(comparePendingImports);
}

/** Sum of item quantities (a line without a quantity counts as 1). */
export function pendingItemCount(data: PendingImportExtractionData | null): number {
  return (data?.products ?? []).reduce(
    (sum, p) => sum + (typeof p.quantity === "number" && p.quantity > 0 ? p.quantity : 1),
    0,
  );
}

export interface PendingTotal {
  currency: string | null;
  amount: number;
}

/** Totals per currency (rounded to cents), largest first. */
export function pendingTotalsByCurrency(rows: readonly RankablePendingImport[]): PendingTotal[] {
  const sums = new Map<string | null, number>();
  for (const row of rows) {
    const total = row.extractionData?.total;
    if (typeof total !== "number" || !Number.isFinite(total)) continue;
    const currency = row.extractionData?.currency ?? null;
    sums.set(currency, (sums.get(currency) ?? 0) + total);
  }
  return [...sums.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}
