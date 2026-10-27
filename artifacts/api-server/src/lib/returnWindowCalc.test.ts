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
