import { describe, expect, it } from "vitest";
import { clampPurchaseDateToReceived, isEverydayExtraction } from "./mailSync";

describe("email import filters", () => {
  it("never dates a bill after the email that reports it (due date read as purchase date)", () => {
    // EDP case from session 15: bill received 26 Oct, AI returned the 27 Oct due date.
    expect(clampPurchaseDateToReceived("2026-10-27", "2026-10-26T09:12:00Z")).toBe("2026-10-26");
    expect(clampPurchaseDateToReceived("2026-10-20", "2026-10-26T09:12:00Z")).toBe("2026-10-20");
    expect(clampPurchaseDateToReceived(null, "2026-10-26T09:12:00Z")).toBeNull();
    expect(clampPurchaseDateToReceived("2026-10-27", null)).toBe("2026-10-27");
    expect(clampPurchaseDateToReceived("2026-10-27", "not a date")).toBe("2026-10-27");
  });

  it("drops groceries and utility merchants even when the AI calls them receipts", () => {
    expect(isEverydayExtraction({ category: "Groceries", merchant: "Some shop" })).toBe(true);
    expect(isEverydayExtraction({ category: "Other", merchant: "EDP Comercial" })).toBe(true);
    expect(isEverydayExtraction({ category: "Electronics", merchant: "Worten" })).toBe(false);
  });
});
