import { describe, expect, it } from "vitest";
import { calcReturnWindow, deliveryDateError, returnWindowStart } from "./returnWindowCalc";
import { parseExtraction, toIsoDateOrNull } from "./receiptExtraction";
import { deliveredByReceived } from "./mailSync";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const online = { purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Fixture store" };

describe("return window start", () => {
  it("counts from the delivery date when known", () => {
    const w = calcReturnWindow({ ...online, purchaseDate: iso(-20), deliveryDate: iso(-10) });
    expect(w?.startsFrom).toBe("delivery");
    expect(w?.daysRemaining).toBe(4); // 14 days from delivery
    expect(w?.deadlineDate.toISOString().slice(0, 10)).toBe(iso(4));
  });
  it("falls back to the purchase date without a delivery date", () => {
    const w = calcReturnWindow({ ...online, purchaseDate: iso(-20), deliveryDate: null });
    expect(w).toMatchObject({ startsFrom: "purchase", daysRemaining: -6 });
  });
  it("ignores a delivery date before the purchase or not a real date", () => {
    expect(returnWindowStart("2026-10-10", "2026-10-01")).toEqual({ date: "2026-10-10", from: "purchase" });
    expect(returnWindowStart("2026-10-10", "soon")).toEqual({ date: "2026-10-10", from: "purchase" });
    expect(returnWindowStart("2026-10-10", "2026-10-12")).toEqual({ date: "2026-10-12", from: "delivery" });
  });
  it("Brazil: 7 days from delivery (CDC art. 49)", () => {
    const w = calcReturnWindow({ purchaseDate: iso(-10), deliveryDate: iso(-3), purchaseCountry: "BR", isOnlinePurchase: true, currency: "BRL", merchant: "Loja" });
    expect(w?.daysRemaining).toBe(4);
  });
});

describe("delivery date edits", () => {
  it("accepts null or a real date on/after the purchase", () => {
    expect(deliveryDateError(undefined, "2026-10-01")).toBeNull();
    expect(deliveryDateError(null, "2026-10-01")).toBeNull();
    expect(deliveryDateError("2026-10-03", "2026-10-01")).toBeNull();
    expect(deliveryDateError("2026-09-30", "2026-10-01")).toMatch(/before the purchase/);
    expect(deliveryDateError("03/10/2026", null)).toMatch(/YYYY-MM-DD/);
  });
});

describe("delivery date extraction", () => {
  const base = { isReceipt: true, merchant: "Shop", purchaseDate: "2026-10-01", isOnlinePurchase: true };
  it("keeps a stated delivery date, drops one before the purchase", () => {
    expect(parseExtraction(JSON.stringify({ ...base, deliveryDate: "2026-10-04" })).deliveryDate).toBe("2026-10-04");
    expect(parseExtraction(JSON.stringify({ ...base, deliveryDate: "2026-09-20" })).deliveryDate).toBeNull();
    expect(parseExtraction(JSON.stringify(base)).deliveryDate).toBeNull();
  });
  it("normalises dates", () => {
    expect(toIsoDateOrNull("2026-10-04")).toBe("2026-10-04");
    expect(toIsoDateOrNull("not a date")).toBeNull();
    expect(toIsoDateOrNull(null)).toBeNull();
  });
  it("treats a delivery date after the email as an estimate", () => {
    expect(deliveredByReceived("2026-10-09", "2026-10-05T10:00:00Z")).toBeNull();
    expect(deliveredByReceived("2026-10-05", "2026-10-05T10:00:00Z")).toBe("2026-10-05");
    expect(deliveredByReceived(null, "2026-10-05T10:00:00Z")).toBeNull();
  });
});

describe("EU/EEA countries other than PT", () => {
  it("get the 14-day online withdrawal window", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const c of ["DE", "ES", "FR", "NL", "NO"]) {
      const w = calcReturnWindow({ purchaseDate: today, purchaseCountry: c, isOnlinePurchase: true, currency: "EUR", merchant: "Some shop" });
      expect(w?.daysRemaining).toBe(14);
    }
    expect(calcReturnWindow({ purchaseDate: today, purchaseCountry: "GB", isOnlinePurchase: true, currency: "GBP", merchant: "Some shop" })).toBeNull();
  });
});

describe("unknown purchase channel", () => {
  it("gives no return deadline at a known retailer when the channel is unknown", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(calcReturnWindow({ purchaseDate: today, purchaseCountry: "PT", isOnlinePurchase: null, currency: "EUR", merchant: "Amazon.es" })).toBeNull();
    expect(calcReturnWindow({ purchaseDate: today, purchaseCountry: "PT", isOnlinePurchase: false, currency: "EUR", merchant: "Zara" })).toBeNull();
    expect(calcReturnWindow({ purchaseDate: today, purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Amazon.es" })?.daysRemaining).toBe(14);
  });
});

describe("US accounts (region US)", () => {
  const us = { region: "US", purchaseCountry: "US", currency: "USD", category: "Electronics" };
  it("in-store purchases also get the store window (Best Buy 15 days from purchase)", () => {
    const w = calcReturnWindow({ ...us, merchant: "Best Buy", isOnlinePurchase: false, purchaseDate: "2026-03-01", deliveryDate: "2026-03-05" });
    expect(w).toMatchObject({ basis: "store", days: 15, startsFrom: "purchase" });
    expect(w?.deadlineDate.toISOString().slice(0, 10)).toBe("2026-03-16");
  });
  it("online: counts from delivery; Apple items at Amazon get 15 days", () => {
    const w = calcReturnWindow({ ...us, merchant: "Amazon.com", isOnlinePurchase: true, purchaseDate: "2026-03-01", deliveryDate: "2026-03-03", itemNames: ["Apple AirPods Pro 2"] });
    expect(w).toMatchObject({ basis: "store", days: 15, startsFrom: "delivery" });
  });
  it("the user's saved window wins; 0 days is allowed", () => {
    expect(calcReturnWindow({ ...us, merchant: "Best Buy", isOnlinePurchase: false, purchaseDate: iso(-5), returnDays: 30 })).toMatchObject({ basis: "user", days: 30, daysRemaining: 25 });
    expect(calcReturnWindow({ ...us, merchant: "Unknown Shop", isOnlinePurchase: true, purchaseDate: iso(0), returnDays: 0 })).toMatchObject({ basis: "user", days: 0 });
  });
  it("unknown store, eBay, Costco everyday items and EU law: no window", () => {
    expect(calcReturnWindow({ ...us, merchant: "Joe's Electronics", isOnlinePurchase: true, purchaseDate: iso(0) })).toBeNull();
    expect(calcReturnWindow({ ...us, merchant: "eBay", isOnlinePurchase: true, purchaseDate: iso(0) })).toBeNull();
    expect(calcReturnWindow({ ...us, category: "Home", merchant: "Costco", isOnlinePurchase: false, purchaseDate: iso(0), itemNames: ["Patio chair"] })).toBeNull();
    // A EUR online receipt from a PT shop gets the EU 14 days on PT accounts but nothing on a US account.
    expect(calcReturnWindow({ ...online, purchaseDate: iso(0) })?.days).toBe(14);
    expect(calcReturnWindow({ ...online, region: "US", purchaseDate: iso(0) })).toBeNull();
  });
  it("holiday 2026 extension: Best Buy bought Nov 20 2026 → Jan 15 2027", () => {
    expect(calcReturnWindow({ ...us, merchant: "Best Buy", isOnlinePurchase: false, purchaseDate: "2026-11-20" })).toMatchObject({ basis: "store", holiday: true });
    expect(calcReturnWindow({ ...us, merchant: "Best Buy", isOnlinePurchase: false, purchaseDate: "2026-11-20" })?.deadlineDate.toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});
