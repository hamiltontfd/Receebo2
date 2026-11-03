import type { ExtractedReceipt } from "./receiptExtraction";

/**
 * Hamilton's rule: when the app cannot read a photo well, it asks for a
 * better photo instead of saving invented values. A photo upload whose key
 * fields are unreadable or implausible is rejected as "unreadable".
 */
export type ReadabilityReason =
  | "model_unreadable"
  | "missing_total"
  | "missing_date"
  | "future_date"
  | "implausibly_old_date"
  | "items_total_mismatch";

export type ReadabilityVerdict = { ok: true } | { ok: false; reasons: ReadabilityReason[] };

/** Receipts older than this are almost certainly a misread year. */
export const MAX_RECEIPT_AGE_YEARS = 25;
/** Total may be this much below the item sum (discounts) ... */
export const MAX_DISCOUNT_SHARE = 0.5;
/** ... or this much above it (tax, tips, delivery and other fees). */
export const MAX_FEES_SHARE = 0.5;
/** Absolute slack for small fees on cheap purchases and rounding. */
export const FEES_SLACK = 5;

function itemsMatchTotal(data: ExtractedReceipt): boolean {
  const priced = data.products.filter((p) => p.price != null);
  if (priced.length === 0 || data.total == null) return true;
  // "price" may be the line total or the unit price; accept either reading.
  const lineTotals = priced.reduce((sum, p) => sum + (p.price as number), 0);
  const unitTimesQty = priced.reduce((sum, p) => sum + (p.price as number) * (p.quantity ?? 1), 0);
  return [lineTotals, unitTimesQty].some((sum) => {
    if (sum <= 0) return true;
    const low = sum * (1 - MAX_DISCOUNT_SHARE) - 0.01;
    const high = sum * (1 + MAX_FEES_SHARE) + FEES_SLACK;
    return data.total! >= low && data.total! <= high;
  });
}

export function assessReadability(data: ExtractedReceipt, now: Date = new Date()): ReadabilityVerdict {
  const reasons: ReadabilityReason[] = [];
  if (data.legible === false) reasons.push("model_unreadable");
  if (data.total == null) reasons.push("missing_total");
  if (data.purchaseDate == null) {
    reasons.push("missing_date");
  } else {
    const date = new Date(`${data.purchaseDate}T00:00:00Z`);
    // One day of slack for time zones.
    if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) reasons.push("future_date");
    const oldest = new Date(now);
    oldest.setUTCFullYear(oldest.getUTCFullYear() - MAX_RECEIPT_AGE_YEARS);
    if (date.getTime() < oldest.getTime()) reasons.push("implausibly_old_date");
  }
  if (!itemsMatchTotal(data)) reasons.push("items_total_mismatch");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}
