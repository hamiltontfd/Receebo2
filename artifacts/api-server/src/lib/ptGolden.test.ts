/**
 * Golden outputs for Portugal (and every account without a region). Captured
 * on label-fix f213c79, before US mode: the snapshot must never change for
 * PT accounts. If a PT rule changes on purpose, update the snapshot in the
 * same commit and say so in docs/assistant-log.md.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calcReturnWindow } from "./returnWindowCalc";
import { computeWarrantyExpiries } from "./warrantyExpiry";
import { renderReturnReminder, renderWarrantyReminder } from "./reminderCopy";
import { formatEmailDate, formatMoney } from "./emailFormat";

export const GOLDEN_TODAY = "2026-11-15T12:00:00Z";

const PLACES = [
  { purchaseCountry: "PT", currency: "EUR", merchant: "Worten" },
  { purchaseCountry: null, currency: "EUR", merchant: "Continente" },
  { purchaseCountry: null, currency: "EUR", merchant: "Amazon" },
  { purchaseCountry: "DE", currency: "EUR", merchant: "Zalando" },
  { purchaseCountry: "BR", currency: "BRL", merchant: "Magazine Luiza" },
  { purchaseCountry: null, currency: "USD", merchant: "Best Buy" },
  { purchaseCountry: "US", currency: "USD", merchant: "Walmart" },
  { purchaseCountry: "US", currency: "USD", merchant: "Corner Shop" },
  { purchaseCountry: null, currency: "CAD", merchant: "Canadian Tire" },
  { purchaseCountry: null, currency: "GBP", merchant: "Argos" },
  { purchaseCountry: null, currency: null, merchant: null },
];
const CHANNELS = [true, false, null];
const CASES = [
  { category: "Electronics", purchaseDate: "2026-11-01", deliveryDate: "2026-11-04", warranty: "2-year manufacturer warranty", purchaseType: null },
  { category: "Home", purchaseDate: "2026-10-20", deliveryDate: null, warranty: null, purchaseType: "goods" },
  { category: "Groceries", purchaseDate: "2026-11-10", deliveryDate: null, warranty: null, purchaseType: null },
  { category: "Other", purchaseDate: "2024-02-29", deliveryDate: null, warranty: "Garantia de 12 meses", purchaseType: null },
  { category: "Electronics", purchaseDate: "2026-11-12", deliveryDate: null, warranty: null, purchaseType: "subscription" },
];

export function goldenInputs() {
  const out = [];
  for (const place of PLACES) for (const isOnlinePurchase of CHANNELS) for (const c of CASES) {
    out.push({ ...place, isOnlinePurchase, ...c });
  }
  return out;
}

const sony = {
  merchant: "Worten", products: [{ name: "Sony WH-1000XM5 headphones", price: 349 }, { name: "Case", price: 19 }],
  total: 1299.99, currency: "EUR", purchaseDate: "2026-10-12",
};

describe("PT golden outputs (must not change)", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(GOLDEN_TODAY)); });
  afterAll(() => { vi.useRealTimers(); });

  it("return windows and warranty end dates", () => {
    const rows = goldenInputs().map((input) => {
      const w = calcReturnWindow(input);
      return {
        input: `${input.purchaseCountry}/${input.currency}/${input.merchant}/${input.isOnlinePurchase}/${input.category}/${input.purchaseDate}/${input.purchaseType}`,
        returnWindow: w ? { deadline: w.deadlineDate.toISOString().slice(0, 10), daysRemaining: w.daysRemaining, startsFrom: w.startsFrom, days: w.days, basis: w.basis } : null,
        warranty: computeWarrantyExpiries(input),
      };
    });
    expect(rows).toMatchSnapshot();
  });

  it("reminder copy, money and dates", () => {
    const deadline = new Date("2026-10-31T00:00:00Z");
    expect({
      returnLaw: renderReturnReminder({ ...sony, deadline, daysRemaining: 7, basis: "law", windowDays: 14 }),
      returnStore: renderReturnReminder({ ...sony, currency: "USD", merchant: "Best Buy", deadline, daysRemaining: 1, basis: "store" }),
      warrantyLegal: renderWarrantyReminder({ ...sony, kind: "legal", expiresOn: "2029-10-12", other: { kind: "manufacturer", expiresOn: "2028-10-12" } }),
      warrantyMaker: renderWarrantyReminder({ ...sony, currency: "USD", merchant: "Best Buy", kind: "manufacturer", expiresOn: "2028-11-27" }),
      money: [formatMoney(1299.99, "EUR"), formatMoney(1299.99, "USD"), formatMoney(3, "GBP"), formatMoney(5, "XYZ"), formatMoney(5, null)],
      dates: [formatEmailDate("2028-11-27"), formatEmailDate(new Date("2026-10-26T23:30:00Z")), formatEmailDate("bogus")],
    }).toMatchSnapshot();
  });

  it("an explicit PT region (and any non-US value) gives exactly the same return windows", () => {
    for (const input of goldenInputs()) {
      const expected = calcReturnWindow(input);
      expect(calcReturnWindow({ ...input, region: "PT", returnDays: 99, itemNames: ["iPhone"] })).toEqual(expected);
      expect(calcReturnWindow({ ...input, region: null })).toEqual(expected);
    }
  });
});
