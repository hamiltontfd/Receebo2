/**
 * The day a receipt sorts by in the list (same rule as the API's order):
 * its purchase date, or the day it was added when there is none, and never
 * later than the day it was added. YYYY-MM-DD.
 */
export function receiptListDay(r: { purchaseDate?: string | null; createdAt: string }): string {
  const added = new Date(r.createdAt).toISOString().slice(0, 10);
  const p = r.purchaseDate ? r.purchaseDate.slice(0, 10) : null;
  return p && p < added ? p : added;
}

export function receiptListYear(r: { purchaseDate?: string | null; createdAt: string }): number {
  return Number(receiptListDay(r).slice(0, 4));
}
