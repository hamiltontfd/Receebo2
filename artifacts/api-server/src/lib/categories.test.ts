import { describe, expect, it } from "vitest";
import { CANONICAL_CATEGORIES, normalizeCategory } from "./categories";

describe("normalizeCategory", () => {
  it("keeps every canonical category, including Entertainment", () => {
    for (const c of CANONICAL_CATEGORIES) expect(normalizeCategory(c)).toBe(c);
    expect(normalizeCategory("Entertainment")).toBe("Entertainment");
  });

  it("matches case-insensitively and trims", () => {
    expect(normalizeCategory(" entertainment ")).toBe("Entertainment");
    expect(normalizeCategory("clothing & apparel")).toBe("Clothing & Apparel");
  });

  it("maps unknown or empty values to Other", () => {
    expect(normalizeCategory("Tickets")).toBe("Other");
    expect(normalizeCategory(null)).toBe("Other");
    expect(normalizeCategory("")).toBe("Other");
  });
});
