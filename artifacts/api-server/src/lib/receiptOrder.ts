import { desc, sql, type SQL } from "drizzle-orm";
import { receiptsTable } from "@workspace/db";

/**
 * Receipts list order: newest receipt date first.
 *
 * The receipt date is the purchase date read from the receipt. When it is
 * missing it falls back to the day the receipt was added, and a purchase date
 * later than the day it was added (an OCR typo such as 2062) is capped to that
 * day so it can't pin itself to the top. Ties (same day) keep the most recently
 * added first, then the highest id, so the order is total and pages never
 * overlap or skip.
 */
const createdDay = sql`(${receiptsTable.createdAt} at time zone 'UTC')::date`;
export const receiptSortDay: SQL = sql`least(coalesce(${receiptsTable.purchaseDate}, ${createdDay}), ${createdDay})`;
const createdMs = sql`date_trunc('milliseconds', ${receiptsTable.createdAt})`;

export const receiptListOrder: SQL[] = [desc(receiptSortDay), desc(createdMs), desc(receiptsTable.id)];

/** Same day as `receiptSortDay`, computed in JS for the cursor (YYYY-MM-DD, UTC). */
export function sortDayOf(r: { purchaseDate: string | null; createdAt: Date | string }): string {
  const created = new Date(r.createdAt).toISOString().slice(0, 10);
  const p = r.purchaseDate ? r.purchaseDate.slice(0, 10) : null;
  return p && p < created ? p : created;
}

export type ReceiptCursor = { day: string; createdAt: string; id: number };

export function encodeReceiptCursor(r: { id: number; purchaseDate: string | null; createdAt: Date | string }): string {
  return `${sortDayOf(r)}_${new Date(r.createdAt).toISOString()}_${r.id}`;
}

/** Null for anything that isn't a cursor from `encodeReceiptCursor` (incl. the old timestamp-only cursor). */
export function decodeReceiptCursor(raw: string | undefined): ReceiptCursor | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_(\d+)$/.exec(raw);
  if (!m) return null;
  if (Number.isNaN(Date.parse(m[1])) || Number.isNaN(Date.parse(m[2]))) return null;
  return { day: m[1], createdAt: m[2], id: Number(m[3]) };
}

/** Rows strictly after the cursor in `receiptListOrder`. */
export function afterReceiptCursor(c: ReceiptCursor): SQL {
  return sql`(${receiptSortDay}, ${createdMs}, ${receiptsTable.id}) < (${c.day}::date, ${c.createdAt}::timestamptz, ${c.id})`;
}
