/**
 * Backfill purchase_type for receipts saved before the field existed
 * (Apple iCloud+/Apple One renewals, App Store purchases, event tickets…).
 *
 * Dry run by default: reads only and reports what it would change. Writes only
 * with { apply: true } — startup env PURCHASE_TYPE_BACKFILL=apply, or
 * `pnpm run backfill:purchase-types -- --apply`.
 *
 * Only receipts with purchase_type IS NULL are touched (never a manual or AI
 * value) and only on strong deterministic hints (lib/purchaseType.ts), stored
 * with source "hint". Applying also clears their warranty dates through
 * syncWarrantyExpiries; return windows are computed live, so the sweep stops
 * reminding as soon as the type is set. WARRANTY_CALC_VERSION is not bumped:
 * that would rewrite every row on the next boot without a dry run.
 */
import { db, receiptsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { purchaseTypeHint } from "./purchaseType";
import { calcReturnWindow } from "./returnWindowCalc";
import { syncWarrantyExpiries, warrantyInputColumns } from "./warrantyExpiryStore";

export interface PurchaseTypeBackfillReport {
  applied: boolean;
  scanned: number;
  /** Receipts that would get (or got) a type, per type. */
  byType: Record<string, number>;
  /** Same, per merchant (top 20), for a quick sanity check before applying. */
  byMerchant: Record<string, number>;
  /** Of those, how many currently have a warranty date / an open return window that goes away. */
  withWarrantyDates: number;
  withOpenReturnWindow: number;
  /** Rows actually written (0 in a dry run). */
  updated: number;
}

export async function backfillPurchaseTypes(
  { apply = false, now = new Date(), userId }: { apply?: boolean; now?: Date; /** Limit to one user (tests). */ userId?: string } = {},
): Promise<PurchaseTypeBackfillReport> {
  const rows = await db.select({
    ...warrantyInputColumns,
    summary: receiptsTable.summary,
    ocrText: receiptsTable.ocrText,
    products: receiptsTable.products,
    isOnlinePurchase: receiptsTable.isOnlinePurchase,
  }).from(receiptsTable).where(and(
    eq(receiptsTable.status, "completed"),
    isNull(receiptsTable.purchaseType),
    userId ? eq(receiptsTable.userId, userId) : undefined,
  ));

  const report: PurchaseTypeBackfillReport = {
    applied: apply, scanned: rows.length, byType: {}, byMerchant: {},
    withWarrantyDates: 0, withOpenReturnWindow: 0, updated: 0,
  };
  const merchants = new Map<string, number>();
  for (const row of rows) {
    const type = purchaseTypeHint(row);
    if (!type) continue;
    report.byType[type] = (report.byType[type] ?? 0) + 1;
    const merchant = row.merchant?.trim() || "(no merchant)";
    merchants.set(merchant, (merchants.get(merchant) ?? 0) + 1);
    if (row.legalWarrantyExpiresOn || row.manufacturerWarrantyExpiresOn) report.withWarrantyDates++;
    const window = row.purchaseDate ? calcReturnWindow({ ...row, purchaseDate: row.purchaseDate, purchaseType: null }) : null;
    if (window && window.deadlineDate.getTime() >= new Date(now).setUTCHours(0, 0, 0, 0)) report.withOpenReturnWindow++;

    if (!apply) continue;
    // Conditional: a manual/AI type set meanwhile always wins.
    const updated = await db.update(receiptsTable)
      .set({ purchaseType: type, purchaseTypeSource: "hint" })
      .where(and(eq(receiptsTable.id, row.id), isNull(receiptsTable.purchaseType)))
      .returning({ id: receiptsTable.id });
    if (updated.length === 0) continue;
    report.updated++;
    await syncWarrantyExpiries({ ...row, purchaseType: type });
  }
  report.byMerchant = Object.fromEntries([...merchants].sort((a, b) => b[1] - a[1]).slice(0, 20));
  return report;
}

/** Startup hook: dry run unless PURCHASE_TYPE_BACKFILL=apply. */
export function purchaseTypeBackfillMode(env: NodeJS.ProcessEnv = process.env): "dry-run" | "apply" {
  return env.PURCHASE_TYPE_BACKFILL?.trim().toLowerCase() === "apply" ? "apply" : "dry-run";
}
