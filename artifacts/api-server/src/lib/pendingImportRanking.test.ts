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
    expect(pendingItemCount(row(1, { products: [{ name: "a", quantity: 2, price: 1 }, { name: "b", quantity: null, price: 1 }] }).extractionData)).toBe(3);
    expect(pendingTotalsByCurrency([row(1, { total: 1.1 }), row(2, { total: 2.2 }), row(3, { total: null })]))
      .toEqual([{ currency: "EUR", amount: 3.3 }]);
  });
});
