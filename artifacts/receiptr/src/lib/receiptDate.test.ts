import { describe, expect, it } from "vitest";
import { receiptListDay, receiptListYear } from "./receiptDate";

describe("receiptListDay", () => {
  it("uses the purchase date, not the import date", () => {
    expect(receiptListDay({ purchaseDate: "2025-12-24", createdAt: "2026-10-29T10:00:00Z" })).toBe("2025-12-24");
    expect(receiptListYear({ purchaseDate: "2025-12-24", createdAt: "2026-10-29T10:00:00Z" })).toBe(2025);
  });
  it("falls back to the added day and caps future purchase dates", () => {
    expect(receiptListDay({ purchaseDate: null, createdAt: "2026-09-15T10:00:00Z" })).toBe("2026-09-15");
    expect(receiptListDay({ purchaseDate: "2062-01-05", createdAt: "2026-05-01T10:00:00Z" })).toBe("2026-05-01");
  });
});
