import { describe, expect, it } from "vitest";
import { hasNoConsumerDates, normalizePurchaseType, purchaseTypeHint, resolvePurchaseType } from "./purchaseType";
import { calcReturnWindow } from "./returnWindowCalc";
import { computeWarrantyExpiries } from "./warrantyExpiry";
import { parseExtraction } from "./receiptExtraction";
import { pendingPurchaseType, rankPendingImports } from "./pendingImportRanking";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

describe("purchase type", () => {
  it("normalises AI values and synonyms; only goods (or unknown) keeps dates", () => {
    expect(normalizePurchaseType("Subscription")).toBe("subscription");
    expect(normalizePurchaseType("goods")).toBe("goods");
    expect(normalizePurchaseType("banana")).toBeNull();
    expect(normalizePurchaseType(null)).toBeNull();
    for (const t of ["subscription", "digital", "ticket", "service"]) expect(hasNoConsumerDates(t)).toBe(true);
    for (const t of ["goods", null, undefined, "x"]) expect(hasNoConsumerDates(t as string)).toBe(false);
  });

  it("hints Apple iCloud+/Apple One renewals as subscriptions", () => {
    expect(purchaseTypeHint({ merchant: "Apple", products: [{ name: "iCloud+ with 200 GB (Monthly)" }] })).toBe("subscription");
    expect(purchaseTypeHint({ merchant: "Apple", products: [{ name: "Apple One Individual" }] })).toBe("subscription");
    expect(purchaseTypeHint({ merchant: "Apple", ocrText: "iCloud+ 50GB\nRenews 12 Nov 2026" })).toBe("subscription");
    expect(purchaseTypeHint({ merchant: "Spotify", products: [{ name: "Spotify Premium Individual" }] })).toBe("subscription");
  });

  it("hints App Store and in-app purchases as digital, also from the Apple receipt email", () => {
    expect(purchaseTypeHint({ merchant: "Apple", summary: "App Store purchase", products: [{ name: "Procreate" }] })).toBe("digital");
    expect(purchaseTypeHint({ merchant: "Apple", products: [{ name: "Gems pack" }], from: "Apple <no_reply@email.apple.com>", subject: "Your receipt from Apple." })).toBe("digital");
    // Apple hardware orders keep their dates.
    expect(purchaseTypeHint({ merchant: "Apple", products: [{ name: "iPhone 17" }], from: "Apple Store <order_acknowledgment@orders.apple.com>", subject: "We're processing your order" })).toBeNull();
  });

  it("hints tickets from ticket sellers or Entertainment + ticket words", () => {
    expect(purchaseTypeHint({ merchant: "Ticketline", products: [{ name: "Coldplay — Estádio" }] })).toBe("ticket");
    expect(purchaseTypeHint({ merchant: "Coliseu", category: "Entertainment", products: [{ name: "Bilhete Plateia A12" }] })).toBe("ticket");
    // Entertainment goods (a board game) keep their dates.
    expect(purchaseTypeHint({ merchant: "Fnac", category: "Entertainment", products: [{ name: "Catan board game" }] })).toBeNull();
  });

  it("ignores store footers: badges and ads in the OCR text don't decide the type", () => {
    expect(purchaseTypeHint({ merchant: "Worten", products: [{ name: "Samsung TV 55\"" }], ocrText: "Get it on Google Play · Download on the App Store · Netflix included for 3 months" })).toBeNull();
  });

  it("AI wins over hints; hints only fill a missing AI value", () => {
    expect(resolvePurchaseType("goods", { products: [{ name: "Apple One" }] })).toEqual({ purchaseType: "goods", purchaseTypeSource: "ai" });
    expect(resolvePurchaseType(null, { products: [{ name: "Apple One" }] })).toEqual({ purchaseType: "subscription", purchaseTypeSource: "hint" });
    expect(resolvePurchaseType(undefined, { products: [{ name: "Shoes" }] })).toEqual({ purchaseType: null, purchaseTypeSource: null });
  });

  it("parses purchaseType from the AI response", () => {
    const base = { isReceipt: true, merchant: "Apple", purchaseDate: "2026-10-01" };
    expect(parseExtraction(JSON.stringify({ ...base, purchaseType: "subscription" })).purchaseType).toBe("subscription");
    expect(parseExtraction(JSON.stringify({ ...base, purchaseType: "nonsense" })).purchaseType).toBeNull();
    expect(parseExtraction(JSON.stringify(base)).purchaseType).toBeNull();
  });
});

describe("no return window and no warranty for subscriptions, digital purchases and tickets", () => {
  const online = { purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Apple", purchaseDate: iso(-2) };
  it("return window", () => {
    expect(calcReturnWindow({ ...online })).not.toBeNull();
    expect(calcReturnWindow({ ...online, purchaseType: "goods" })).not.toBeNull();
    for (const t of ["subscription", "digital", "ticket"]) expect(calcReturnWindow({ ...online, purchaseType: t })).toBeNull();
  });
  it("legal and manufacturer warranty, Entertainment category included", () => {
    const input = { ...online, category: "Entertainment", warranty: "2-year manufacturer warranty" };
    const goods = computeWarrantyExpiries(input);
    expect(goods.legal).not.toBeNull();
    expect(goods.manufacturer).not.toBeNull();
    for (const t of ["subscription", "digital", "ticket"]) {
      expect(computeWarrantyExpiries({ ...input, purchaseType: t })).toEqual({ legal: null, manufacturer: null });
    }
  });
  it("reports law vs store basis and length of the return window", () => {
    expect(calcReturnWindow({ ...online })).toMatchObject({ basis: "law", days: 14 });
  });
});

describe("pending imports with a purchase type", () => {
  const row = (id: number, data: Record<string, unknown>) => ({
    id, createdAt: new Date("2026-10-01T00:00:00Z"),
    extractionData: {
      merchant: `m${id}`, purchaseDate: "2026-10-10", total: 10, currency: "EUR", category: "Other",
      summary: null, ocrText: null, warranty: null, transactionNumber: null, products: [],
      notableItems: [], purchaseCountry: null, isOnlinePurchase: null, ...data,
    } as any,
  });
  it("uses the stored type, else hints from the stored text", () => {
    expect(pendingPurchaseType(row(1, { purchaseType: "ticket", purchaseTypeSource: "ai" }).extractionData)).toEqual({ purchaseType: "ticket", purchaseTypeSource: "ai" });
    expect(pendingPurchaseType(row(2, { products: [{ name: "Apple One", quantity: 1, price: 19.95 }] }).extractionData)).toEqual({ purchaseType: "subscription", purchaseTypeSource: "hint" });
    expect(pendingPurchaseType(row(3, {}).extractionData)).toEqual({ purchaseType: null, purchaseTypeSource: null });
  });
  it("a subscription with notable items or a durable category is not ranked as worth keeping", () => {
    const ranked = rankPendingImports([
      row(1, { purchaseType: "subscription", category: "Electronics", notableItems: [{ name: "iCloud+", price: 2.99, category: null, reason: "r" }] }),
      row(2, { category: "Home" }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual([2, 1]);
  });
});
