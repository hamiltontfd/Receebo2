import { describe, expect, it } from "vitest";
import { Ticket, Package } from "lucide-react";
import { CATEGORIES, categoryIcon, categoryStyle } from "./categories";

describe("categories", () => {
  it("offers Entertainment between Groceries and Other", () => {
    expect(CATEGORIES).toEqual([
      "Electronics", "Home", "Clothing & Apparel", "Groceries", "Entertainment", "Other",
    ]);
  });

  it("styles Entertainment as a violet chip with a ticket icon", () => {
    expect(categoryStyle("Entertainment")).toBe("bg-violet-100 text-violet-700");
    expect(categoryIcon("Entertainment")).toBe(Ticket);
  });

  it("falls back to Other for unknown or empty categories", () => {
    expect(categoryStyle("Travel")).toBe(categoryStyle("Other"));
    expect(categoryIcon(null)).toBe(Package);
  });
});
