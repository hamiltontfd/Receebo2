import { describe, expect, it } from "vitest";
import { deriveConsumerRights, returnWindowStartDate } from "./consumerRights";

const local = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("return window start (web)", () => {
  it("counts from delivery when known, else from purchase", () => {
    const base = { purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Shop", category: "Electronics" };
    const delivered = deriveConsumerRights({ ...base, purchaseDate: local(-20), deliveryDate: local(-10) });
    expect(delivered.returnWindow).toMatchObject({ startsFrom: "delivery", daysLeft: 4, isExpired: false });
    const notDelivered = deriveConsumerRights({ ...base, purchaseDate: local(-20) });
    expect(notDelivered.returnWindow).toMatchObject({ startsFrom: "purchase", isExpired: true });
  });
  it("counts the PT legal warranty from delivery when known, else from purchase", () => {
    const base = { purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Shop", category: "Electronics" };
    const a = deriveConsumerRights({ ...base, purchaseDate: "2026-01-10", deliveryDate: "2026-01-20" });
    const b = deriveConsumerRights({ ...base, purchaseDate: "2026-01-10" });
    expect(a.warranty?.expiry.getTime()).toBe(new Date("2029-01-20T00:00:00").getTime());
    expect(b.warranty?.expiry.getTime()).toBe(new Date("2029-01-10T00:00:00").getTime());
  });
  it("ignores an impossible delivery date", () => {
    expect(returnWindowStartDate("2026-10-10", "2026-10-01")).toEqual({ date: "2026-10-10", from: "purchase" });
    expect(returnWindowStartDate("2026-10-10", "2026-10-11")).toEqual({ date: "2026-10-11", from: "delivery" });
  });
});

import { parseManufacturerWarrantyMonths } from "./consumerRights";

describe("Brazil: legal and manufacturer warranties side by side", () => {
  const br = { purchaseCountry: "BR", currency: "BRL", merchant: "Magazine", category: "Electronics" };
  it("legal = 90 days from delivery to report apparent defects; manufacturer = its own date; never added", () => {
    const rights = deriveConsumerRights({
      ...br, isOnlinePurchase: true, purchaseDate: "2026-03-01", deliveryDate: "2026-03-05",
      warrantyText: "Garantia do fabricante: 12 meses",
    });
    expect(rights.warranty).toMatchObject({ kind: "complaint_deadline", citation: "CDC Art. 26 (Lei 8.078/1990)" });
    expect(rights.warranty?.expiry.getTime()).toBe(new Date("2026-06-03T00:00:00").getTime()); // 5 Mar + 90 days
    expect(rights.manufacturerWarranty?.months).toBe(12);
    expect(rights.manufacturerWarranty?.expiry.getTime()).toBe(new Date("2027-03-01T00:00:00").getTime());
    // Not added together: the legal date is not manufacturer end + 90 days.
    expect(rights.warranty!.expiry.getTime()).toBeLessThan(rights.manufacturerWarranty!.expiry.getTime());
    expect(rights.notes).toHaveLength(3); // hidden defect, art. 18, art. 49 (online)
    expect(rights.legalReviewPending).toBe(true);
  });
  it("in store: no return window or withdrawal note; pt-BR copy", () => {
    const rights = deriveConsumerRights({
      ...br, category: "Clothing & Apparel", isOnlinePurchase: false, purchaseDate: "2026-03-01", locale: "pt-BR",
    });
    expect(rights.returnWindow).toBeNull();
    expect(rights.warranty?.label).toBe("Garantia legal (CDC): 90 dias para reclamar de defeitos");
    expect(rights.notes).toHaveLength(2);
    expect(rights.disclaimer).toContain("Procon");
  });
});

describe("US: structure only", () => {
  it("no legal warranty; store policy labelled as typical; review marker on", () => {
    const rights = deriveConsumerRights({
      purchaseCountry: "US", currency: "USD", merchant: "Best Buy", category: "Electronics",
      isOnlinePurchase: true, purchaseDate: "2026-03-01",
    });
    expect(rights.warranty).toBeNull();
    expect(rights.returnWindow?.source).toBe("Best Buy return policy (typical, check with the store)");
    expect(rights.notes[0]).toMatch(/No federal minimum/);
    expect(rights.legalReviewPending).toBe(true);
  });
});

describe("manufacturer warranty parsing", () => {
  it("reads years and months in en/pt, ignores return policies and legal warranties", () => {
    expect(parseManufacturerWarrantyMonths("2-year manufacturer warranty")).toBe(24);
    expect(parseManufacturerWarrantyMonths("Garantia de 12 meses")).toBe(12);
    expect(parseManufacturerWarrantyMonths("1 ano de garantia")).toBe(12);
    expect(parseManufacturerWarrantyMonths("30-day returns")).toBeNull();
    expect(parseManufacturerWarrantyMonths("Garantia legal de 3 anos")).toBeNull();
    expect(parseManufacturerWarrantyMonths(null)).toBeNull();
  });
  it("PT keeps the 3-year legal warranty and shows the manufacturer one separately", () => {
    const rights = deriveConsumerRights({
      purchaseCountry: "PT", currency: "EUR", merchant: "Worten", category: "Electronics",
      purchaseDate: "2026-01-10", warrantyText: "2-year manufacturer warranty",
    });
    expect(rights.warranty).toMatchObject({ kind: "warranty", label: "3-year legal warranty" });
    expect(rights.manufacturerWarranty?.expiry.getFullYear()).toBe(2028);
    expect(rights.legalReviewPending).toBe(false);
  });
});

describe("EU/EEA countries other than PT", () => {
  it("get the EU 2-year legal warranty and 14-day online withdrawal", () => {
    for (const c of ["DE", "ES", "FR", "NO"]) {
      const r = deriveConsumerRights({ purchaseCountry: c, currency: "EUR", merchant: "Shop", category: "Electronics", isOnlinePurchase: true, purchaseDate: "2026-03-10" });
      expect(r.countryLabel).toBe("EU");
      expect(r.warranty?.citation).toBe("EU Directive 2019/771");
      expect(r.returnWindow?.source).toBe("EU Directive 2011/83/EU");
    }
  });
  it("leaves GB without EU rules", () => {
    const r = deriveConsumerRights({ purchaseCountry: "GB", currency: "GBP", merchant: "Shop", category: "Electronics", isOnlinePurchase: true, purchaseDate: "2026-03-10" });
    expect(r.warranty).toBeNull();
    expect(r.returnWindow).toBeNull();
  });
});

describe("unknown purchase channel", () => {
  it("shows the store policy as a note, with no deadline, at a known retailer", () => {
    const r = deriveConsumerRights({ purchaseCountry: "PT", currency: "EUR", merchant: "Zara", category: "Clothing & Apparel", isOnlinePurchase: null, purchaseDate: "2026-03-10" });
    expect(r.returnWindow).toBeNull();
    expect(r.notes.some((n) => n.includes("Zara") && n.includes("30"))).toBe(true);
  });
  it("keeps the 14-day window for an explicit online purchase", () => {
    const r = deriveConsumerRights({ purchaseCountry: "PT", currency: "EUR", merchant: "Zara", category: "Clothing & Apparel", isOnlinePurchase: true, purchaseDate: "2026-03-10" });
    expect(r.returnWindow?.source).toBe("EU CRD / DL 24/2014");
  });
});
