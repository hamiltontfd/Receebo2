/**
 * Golden outputs of deriveConsumerRights for Portugal (and every account
 * without a region). Captured on label-fix f213c79, before US mode: the
 * snapshot must never change for PT accounts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deriveConsumerRights, type ConsumerRightsResult } from "./consumerRights";

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
  { category: "Electronics", purchaseDate: "2026-11-01", deliveryDate: "2026-11-04", warrantyText: "2-year manufacturer warranty", purchaseType: null },
  { category: "Home", purchaseDate: "2026-10-20", deliveryDate: null, warrantyText: null, purchaseType: "goods" },
  { category: "Groceries", purchaseDate: "2026-11-10", deliveryDate: null, warrantyText: null, purchaseType: null },
  { category: "Other", purchaseDate: "2024-02-29", deliveryDate: null, warrantyText: "Garantia de 12 meses", purchaseType: null },
  { category: "Electronics", purchaseDate: "2026-11-12", deliveryDate: null, warrantyText: null, purchaseType: "subscription" },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function plain(r: ConsumerRightsResult) {
  return {
    ...r,
    returnWindow: r.returnWindow ? { ...r.returnWindow, deadline: ymd(r.returnWindow.deadline) } : null,
    warranty: r.warranty ? { ...r.warranty, expiry: ymd(r.warranty.expiry) } : null,
    manufacturerWarranty: r.manufacturerWarranty ? { ...r.manufacturerWarranty, expiry: ymd(r.manufacturerWarranty.expiry) } : null,
  };
}

describe("PT golden outputs of deriveConsumerRights (must not change)", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 15, 12)); });
  afterAll(() => { vi.useRealTimers(); });

  for (const locale of ["en", "pt-PT"] as const) {
    it(`locale ${locale}`, () => {
      const rows = [];
      for (const place of PLACES) for (const isOnlinePurchase of CHANNELS) for (const c of CASES) {
        const input = { ...place, isOnlinePurchase, ...c, locale };
        rows.push({
          input: `${place.purchaseCountry}/${place.currency}/${place.merchant}/${isOnlinePurchase}/${c.category}/${c.purchaseDate}/${c.purchaseType}`,
          out: plain(deriveConsumerRights(input)),
        });
      }
      expect(rows).toMatchSnapshot();
    });
  }
});
