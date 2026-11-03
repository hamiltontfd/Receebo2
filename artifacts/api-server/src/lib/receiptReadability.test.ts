import { describe, expect, it } from "vitest";
import type { ExtractedReceipt } from "./receiptExtraction";
import { assessReadability } from "./receiptReadability";

const NOW = new Date("2026-11-03T12:00:00Z");
const base = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt => ({
  isReceipt: true, merchant: "LLT Material de Construção de Niterói", purchaseDate: "2026-08-12",
  total: 56.9, currency: "BRL", category: "Home", summary: null, ocrText: null, warranty: null,
  transactionNumber: "000.005.933",
  products: [
    { name: "Cimento CSN CPIII 50kg", quantity: 1, price: 35.5 },
    { name: "Clarofilito 18kg Argamil", quantity: 2, price: 25 },
  ],
  notableItems: [], purchaseCountry: "BR", isOnlinePurchase: false, deliveryDate: null,
  purchaseType: "goods", legible: true, ...over,
});

describe("assessReadability: ask for a better photo instead of saving guesses", () => {
  it("accepts the real DANFE (items 60.50, discount 3.60, total 56.90)", () => {
    expect(assessReadability(base(), NOW)).toEqual({ ok: true });
  });

  it("accepts unit prices times quantity", () => {
    const data = base({ total: 60.5, products: [
      { name: "Cimento", quantity: 1, price: 35.5 }, { name: "Clarofilito", quantity: 2, price: 12.5 },
    ] });
    expect(assessReadability(data, NOW)).toEqual({ ok: true });
  });

  it("accepts tax, tips and small fees above the item sum, and receipts without priced items", () => {
    expect(assessReadability(base({ total: 4.5, products: [{ name: "Café", quantity: 1, price: 1 }] }), NOW).ok).toBe(true);
    expect(assessReadability(base({ total: 118, products: [{ name: "Dinner", quantity: 1, price: 100 }] }), NOW).ok).toBe(true);
    expect(assessReadability(base({ products: [] }), NOW).ok).toBe(true);
    expect(assessReadability(base({ products: [{ name: "Serviço", quantity: null, price: null }] }), NOW).ok).toBe(true);
  });

  it("rejects when the model says it could not read the photo", () => {
    expect(assessReadability(base({ legible: false }), NOW)).toEqual({ ok: false, reasons: ["model_unreadable"] });
  });

  it("an unanswered legible flag is not a rejection by itself", () => {
    expect(assessReadability(base({ legible: null }), NOW).ok).toBe(true);
  });

  it("rejects a missing total or date", () => {
    expect(assessReadability(base({ total: null }), NOW)).toEqual({ ok: false, reasons: ["missing_total"] });
    expect(assessReadability(base({ purchaseDate: null }), NOW)).toEqual({ ok: false, reasons: ["missing_date"] });
  });

  it("rejects a date in the future (one day of time-zone slack) or implausibly old", () => {
    expect(assessReadability(base({ purchaseDate: "2026-11-04" }), NOW).ok).toBe(true);
    expect(assessReadability(base({ purchaseDate: "2026-11-05" }), NOW)).toEqual({ ok: false, reasons: ["future_date"] });
    expect(assessReadability(base({ purchaseDate: "1999-01-01" }), NOW)).toEqual({ ok: false, reasons: ["implausibly_old_date"] });
    expect(assessReadability(base({ purchaseDate: "2020-07-13" }), NOW).ok).toBe(true);
  });

  it("rejects a total that cannot come from the items", () => {
    expect(assessReadability(base({ total: 160 }), NOW)).toEqual({ ok: false, reasons: ["items_total_mismatch"] });
    expect(assessReadability(base({ total: 10 }), NOW)).toEqual({ ok: false, reasons: ["items_total_mismatch"] });
  });

  it("lists every reason", () => {
    expect(assessReadability(base({ legible: false, total: null, purchaseDate: "2030-01-01" }), NOW)).toEqual({
      ok: false, reasons: ["model_unreadable", "missing_total", "future_date"],
    });
  });
});
