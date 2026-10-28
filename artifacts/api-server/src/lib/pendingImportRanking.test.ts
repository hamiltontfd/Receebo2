import { describe, expect, it } from "vitest";
import { pendingItemCount, pendingTotalsByCurrency, rankPendingImports } from "./pendingImportRanking";

const row = (id: number, data: Record<string, unknown>, createdAt = new Date("2026-10-01T00:00:00Z")) => ({
  id, createdAt,
  extractionData: {
    merchant: `m${id}`, purchaseDate: "2026-10-10", total: 10, currency: "EUR", category: "Other",
    summary: null, ocrText: null, warranty: null, transactionNumber: null, products: [],
    notableItems: [], purchaseCountry: null, isOnlinePurchase: null, ...data,
  } as any,
});

describe("pending import ranking", () => {
  it("never ranks by recency alone: durable highlights and value come first", () => {
    const ranked = rankPendingImports([
      row(1, { total: 5, purchaseDate: "2026-10-27" }),
      row(2, { total: 200 }),
      row(3, { total: 20, category: "Clothing & Apparel" }),
      row(4, { total: 1, notableItems: [{ name: "x", price: 1, category: null, reason: "r" }] }),
      row(5, { total: null, category: "Home" }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual([4, 3, 5, 2, 1]);
  });

  it("breaks ties by most recent purchase, then most recently found", () => {
    const ranked = rankPendingImports([
      row(1, { purchaseDate: "2026-09-01" }),
      row(2, { purchaseDate: "2026-10-01" }),
      row(3, { purchaseDate: "2026-10-01" }, new Date("2026-10-05T00:00:00Z")),
    ]);
    expect(ranked.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("counts quantities and sums totals per currency", () => {
    expect(pendingItemCount(row(1, { products: [{ name: "a", quantity: 2, price: 1 }, { name: "b", quantity: null, price: 1 }] }).extractionData)).toBe(2);
    // Weighed grocery lines count once each, never as summed kilograms.
    expect(pendingItemCount(row(2, { products: [
      { name: "Bananas", quantity: 0.305, price: 0.6 }, { name: "Water", quantity: 84, price: 20 },
      { name: "Apples", quantity: 1.25, price: 2 },
    ] }).extractionData)).toBe(3);
    expect(pendingItemCount(row(3, { products: [] }).extractionData)).toBe(0);
    expect(pendingItemCount(null)).toBe(0);
    expect(pendingTotalsByCurrency([row(1, { total: 1.1 }), row(2, { total: 2.2 }), row(3, { total: null })]))
      .toEqual([{ currency: "EUR", amount: 3.3 }]);
  });
});

describe("worth-keeping order seen in dev (October 2026)", () => {
  it("puts notable items first, then durable categories, then value; currencies compared as plain numbers", () => {
    const tv = [{ name: "Item", price: 1, category: "Electronics", reason: "warranty" }];
    const ranked = rankPendingImports([
      row(1, { merchant: "Continente", total: 104.48, category: "Groceries" }),
      row(2, { merchant: "Geek Squad", total: 487.85, currency: "USD", category: "Other" }),
      row(3, { merchant: "EDP Comercial", total: 7.9, category: "Home", purchaseDate: "2026-10-27" }),
      row(4, { merchant: "Lackto EU", total: 64.32, category: "Other", notableItems: tv }),
      row(5, { merchant: "Amazon.es", total: 266.94, category: "Other", notableItems: tv }),
      row(6, { merchant: "EDP Comercial (older)", total: 7.9, category: "Home", purchaseDate: "2026-10-12" }),
      row(7, { merchant: "Everything is New", total: 178, category: "Other" }),
    ]);
    expect(ranked.map((r) => r.extractionData.merchant)).toEqual([
      "Amazon.es", "Lackto EU", "EDP Comercial", "EDP Comercial (older)", "Geek Squad", "Everything is New", "Continente",
    ]);
  });
});
