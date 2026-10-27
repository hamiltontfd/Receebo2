import { describe, expect, it } from "vitest";
import { addMonthsClamped, addYearsClamped, computeWarrantyExpiries, parseManufacturerWarrantyMonths } from "./warrantyExpiry";

const pt = { purchaseCountry: "PT", currency: "EUR", merchant: "Worten", category: "Electronics" };

describe("server warranty expiry", () => {
  it("reads realistic manufacturer warranty text", () => {
    expect(parseManufacturerWarrantyMonths("2-year manufacturer warranty")).toBe(24);
    expect(parseManufacturerWarrantyMonths("Garantia de 12 meses")).toBe(12);
    expect(parseManufacturerWarrantyMonths("1 ano de garantia do fabricante")).toBe(12);
    expect(parseManufacturerWarrantyMonths("30-day returns")).toBeNull();
    expect(parseManufacturerWarrantyMonths("Garantia legal de 3 anos")).toBeNull();
  });
  it("computes the PT legal warranty and the manufacturer one side by side, never added", () => {
    const e = computeWarrantyExpiries({ ...pt, purchaseDate: "2026-03-10", warranty: "2-year manufacturer warranty" });
    expect(e).toEqual({ legal: "2029-03-10", manufacturer: "2028-03-10" });
  });
  it("keeps an explicit end date from the text", () => {
    expect(computeWarrantyExpiries({ ...pt, purchaseDate: "2026-03-10", warranty: "Warranty until 2027-05-01" }).manufacturer)
      .toBe("2027-05-01");
  });
  it("gives no legal warranty for groceries or unknown countries", () => {
    expect(computeWarrantyExpiries({ ...pt, category: "Groceries", purchaseDate: "2026-03-10" }).legal).toBeNull();
    expect(computeWarrantyExpiries({ purchaseDate: "2026-03-10", currency: "GBP", category: "Electronics" }).legal).toBeNull();
  });
  it("clamps 29 Feb and month ends", () => {
    expect(addYearsClamped("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYearsClamped("2028-02-29", 4)).toBe("2032-02-29");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-05-31", -1)).toBe("2026-04-30");
  });
  it("applies the EU minimum to other EU/EEA countries, not to GB or CH", () => {
    for (const c of ["DE", "ES", "FR", "IT", "NO"]) {
      expect(computeWarrantyExpiries({ purchaseCountry: c, currency: "EUR", category: "Electronics", purchaseDate: "2026-03-10" }).legal)
        .toBe("2028-03-10");
    }
    expect(computeWarrantyExpiries({ purchaseCountry: "GB", currency: "GBP", category: "Electronics", purchaseDate: "2026-03-10" }).legal).toBeNull();
    expect(computeWarrantyExpiries({ purchaseCountry: "CH", currency: "CHF", category: "Electronics", purchaseDate: "2026-03-10" }).legal).toBeNull();
  });
  it("counts the legal warranty from delivery when known; the manufacturer one stays from purchase", () => {
    const e = computeWarrantyExpiries({ ...pt, purchaseDate: "2026-03-10", deliveryDate: "2026-03-15", warranty: "2-year manufacturer warranty" });
    expect(e).toEqual({ legal: "2029-03-15", manufacturer: "2028-03-10" });
    expect(computeWarrantyExpiries({ ...pt, purchaseDate: "2026-03-10", deliveryDate: "2026-03-01" }).legal).toBe("2029-03-10");
  });
});
