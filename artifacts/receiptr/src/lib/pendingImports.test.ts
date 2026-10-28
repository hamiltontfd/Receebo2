import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bulkApprovePending, groupByMonth, itemCountLabel, itemsSummary, itemsUnder, formatTotals, type PendingImportItem,
} from "./pendingImports";

const make = (id: number, over: Partial<PendingImportItem> = {}): PendingImportItem => ({
  id, gmailMessageId: `m${id}`, originalFileName: "r.pdf", merchant: `S${id}`, total: 10, currency: "EUR",
  purchaseDate: "2026-10-20", category: "Other", summary: null, createdAt: "2026-10-28T10:00:00Z", ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("pending import helpers", () => {
  it("groups by month, newest first, keeping the ranked order inside a month", () => {
    const groups = groupByMonth([
      make(1, { purchaseDate: "2026-09-27", total: 89.99 }),
      make(2, { purchaseDate: "2026-10-25", total: 349 }),
      make(3, { purchaseDate: null }),
      make(4, { purchaseDate: "2026-10-01", total: 18.4 }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["October 2026", "September 2026", "No date"]);
    expect(groups[0].items.map((i) => i.id)).toEqual([2, 4]);
    expect(formatTotals(groups[0].totals)).toBe("€367.40");
  });

  it("summarises items as 'first + N more' or falls back to the AI summary", () => {
    expect(itemsSummary({ firstItemName: "Soundbar", productCount: 2, summary: null })).toBe("Soundbar + 1 more");
    expect(itemsSummary({ firstItemName: "Soundbar", productCount: 1, summary: null })).toBe("Soundbar");
    expect(itemsSummary({ firstItemName: null, productCount: 0, summary: "Cinema tickets" })).toBe("Cinema tickets");
  });

  it("counts receipt lines, never summed quantities or weights", () => {
    expect(itemCountLabel({ productCount: 1, itemCount: 1 })).toBe("1 item");
    expect(itemCountLabel({ productCount: 3, itemCount: 3 })).toBe("3 items");
    // An older server summed quantities incl. kg weights: the line count wins.
    expect(itemCountLabel({ productCount: 12, itemCount: 84.305 })).toBe("12 items");
    expect(itemCountLabel({ itemCount: 2 })).toBe("2 items");
    expect(itemCountLabel({ itemCount: 32.144999999999996 })).toBeNull();
    expect(itemCountLabel({ productCount: 0, itemCount: 0 })).toBeNull();
    expect(itemCountLabel({})).toBeNull();
  });

  it("selects only EUR items with a known total under €20", () => {
    const under = itemsUnder([
      make(1, { total: 19.99 }), make(2, { total: 20 }), make(3, { total: 5, currency: "USD" }), make(4, { total: null }),
    ]);
    expect(under.map((i) => i.id)).toEqual([1]);
  });

  it("sends large selections in chunks of 50 and stops at the trial limit", async () => {
    const calls: number[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { ids } = JSON.parse(String(init.body)) as { ids: number[] };
      calls.push(ids);
      return {
        ok: true, status: 200,
        json: async () => ({ approved: ids.slice(0, 3).map((id) => ({ id, receiptId: id })), skipped: ids.slice(3), notFound: [], code: "TRIAL_UPLOAD_LIMIT" }),
      };
    }));
    const ids = Array.from({ length: 120 }, (_, i) => i + 1);
    const result = await bulkApprovePending(ids);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(50);
    expect(result.approved).toHaveLength(3);
    expect(result.skipped).toHaveLength(117);
    expect(result.code).toBe("TRIAL_UPLOAD_LIMIT");
  });
});
