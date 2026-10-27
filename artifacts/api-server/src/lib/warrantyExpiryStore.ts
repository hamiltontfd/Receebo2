import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, receiptsTable } from "@workspace/db";
import { computeWarrantyExpiries, WARRANTY_CALC_VERSION, type WarrantyExpiryInput } from "./warrantyExpiry";
import { logger } from "./logger";

type StoredRow = WarrantyExpiryInput & {
  id: number;
  legalWarrantyExpiresOn: string | null;
  manufacturerWarrantyExpiresOn: string | null;
  warrantyCalcVersion: number | null;
};

export const warrantyInputColumns = {
  id: receiptsTable.id,
  purchaseDate: receiptsTable.purchaseDate,
  deliveryDate: receiptsTable.deliveryDate,
  category: receiptsTable.category,
  currency: receiptsTable.currency,
  purchaseCountry: receiptsTable.purchaseCountry,
  merchant: receiptsTable.merchant,
  warranty: receiptsTable.warranty,
  legalWarrantyExpiresOn: receiptsTable.legalWarrantyExpiresOn,
  manufacturerWarrantyExpiresOn: receiptsTable.manufacturerWarrantyExpiresOn,
  warrantyCalcVersion: receiptsTable.warrantyCalcVersion,
};

/** Recompute a row's warranty dates and persist them if they changed. Returns the fresh dates. */
export async function syncWarrantyExpiries(row: StoredRow): Promise<{ legal: string | null; manufacturer: string | null }> {
  const next = computeWarrantyExpiries(row);
  if (next.legal !== row.legalWarrantyExpiresOn || next.manufacturer !== row.manufacturerWarrantyExpiresOn ||
      row.warrantyCalcVersion !== WARRANTY_CALC_VERSION) {
    await db.update(receiptsTable).set({
      legalWarrantyExpiresOn: next.legal,
      manufacturerWarrantyExpiresOn: next.manufacturer,
      warrantyCalcVersion: WARRANTY_CALC_VERSION,
    }).where(eq(receiptsTable.id, row.id));
  }
  return next;
}

/** Recompute one receipt after it was extracted or edited. Never throws (reminders must not break saving). */
export async function refreshWarrantyExpiries(receiptId: number): Promise<void> {
  try {
    const [row] = await db.select(warrantyInputColumns).from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    if (row) await syncWarrantyExpiries(row);
  } catch (err) {
    logger.warn({ err, receiptId }, "Could not refresh warranty expiry dates");
  }
}

/** Startup backfill: receipts never computed or computed with older rules. */
export async function backfillWarrantyExpiries(): Promise<number> {
  const rows = await db.select(warrantyInputColumns).from(receiptsTable).where(and(
    eq(receiptsTable.status, "completed"),
    or(isNull(receiptsTable.warrantyCalcVersion), lt(receiptsTable.warrantyCalcVersion, WARRANTY_CALC_VERSION)),
  ));
  for (const row of rows) await syncWarrantyExpiries(row);
  return rows.length;
}
