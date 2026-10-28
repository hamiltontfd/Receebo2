/**
 * Canonical receipt categories, shared by AI extraction and the receipts API.
 * Kept in sync with the web list in receiptr/src/lib/categories.ts.
 * Stored as plain text (no DB enum), so adding one needs no migration.
 */
export const CANONICAL_CATEGORIES = [
  "Electronics",
  "Home",
  "Clothing & Apparel",
  "Groceries",
  "Entertainment",
  "Other",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

/** Durable-goods categories used to rank pending email imports (not the warranty rules). */
export const DURABLE_RANKING_CATEGORIES: ReadonlySet<string> = new Set([
  "Electronics",
  "Home",
  "Clothing & Apparel",
]);

/** Exact canonical value, a case-insensitive match of one, or "Other". */
export function normalizeCategory(value: string | null | undefined): CanonicalCategory {
  if (!value) return "Other";
  const trimmed = value.trim();
  const exact = CANONICAL_CATEGORIES.find((c) => c === trimmed);
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  return CANONICAL_CATEGORIES.find((c) => c.toLowerCase() === lower) ?? "Other";
}
