import { describe, expect, it } from "vitest";
import { parseExtraction } from "./receiptExtraction";
import { countryFromStoreDomain, resolvePurchaseCountry } from "./purchaseCountry";

const online = {
  isOnlinePurchase: true as const,
  purchaseCountry: "LU",
  sellerCountry: "LU",
};

describe("resolvePurchaseCountry", () => {
  it("uses the delivery address before the Amazon.es domain and the Luxembourg seat", () => {
    expect(resolvePurchaseCountry({
      ...online,
      deliveryCountry: "PT",
      storeDomain: "amazon.es",
    })).toBe("PT");
    expect(resolvePurchaseCountry({
      ...online,
      deliveryCountry: "pt",
      storeDomain: "https://www.amazon.es/gp/css/order",
    })).toBe("PT");
  });

  it("uses the store domain when the receipt has no delivery address", () => {
    expect(resolvePurchaseCountry({ ...online, deliveryCountry: null, storeDomain: "amazon.es" })).toBe("ES");
    expect(countryFromStoreDomain("amazon.com.br")).toBe("BR");
    expect(resolvePurchaseCountry({ ...online, deliveryCountry: null, storeDomain: "amazon.com.br" })).toBe("BR");
    expect(countryFromStoreDomain("amazon.com")).toBe("US");
    expect(resolvePurchaseCountry({ ...online, deliveryCountry: null, storeDomain: "www.amazon.com" })).toBe("US");
  });

  it("uses the seller's legal seat only when there is no address and the domain has no country", () => {
    expect(resolvePurchaseCountry({
      ...online,
      deliveryCountry: null,
      storeDomain: "loja.example",
    })).toBe("LU");
    expect(resolvePurchaseCountry({
      ...online,
      deliveryCountry: null,
      storeDomain: null,
    })).toBe("LU");
    expect(countryFromStoreDomain("bestbuy.com")).toBeNull();
  });

  it("leaves an in-store purchase on the shop country", () => {
    expect(resolvePurchaseCountry({
      isOnlinePurchase: false,
      purchaseCountry: "PT",
      deliveryCountry: "ES",
      storeDomain: "amazon.es",
      sellerCountry: "LU",
    })).toBe("PT");
    expect(resolvePurchaseCountry({
      isOnlinePurchase: null,
      purchaseCountry: "BR",
      deliveryCountry: "PT",
      storeDomain: "amazon.es",
      sellerCountry: "LU",
    })).toBe("BR");
  });
});

describe("parseExtraction purchase country", () => {
  const base = { isReceipt: true, merchant: "Amazon EU S.à r.l.", purchaseDate: "2026-10-01" };

  it("resolves an Amazon.es order delivered to Portugal as PT", () => {
    const parsed = parseExtraction(JSON.stringify({
      ...base,
      isOnlinePurchase: true,
      purchaseCountry: "LU",
      deliveryCountry: "PT",
      storeDomain: "amazon.es",
      sellerCountry: "LU",
    }));
    expect(parsed.purchaseCountry).toBe("PT");
    expect(parsed.deliveryCountry).toBe("PT");
    expect(parsed.sellerCountry).toBe("LU");
  });

  it("uses a sender domain when the model did not copy one", () => {
    const parsed = parseExtraction(JSON.stringify({
      ...base,
      isOnlinePurchase: true,
      sellerCountry: "LU",
    }), { storeDomain: "auto-confirm@amazon.es" });
    expect(parsed.purchaseCountry).toBe("ES");
    expect(parsed.storeDomain).toBe("auto-confirm@amazon.es");
  });

  it("prefers a sender hostname when the model stored the company name as the domain", () => {
    const parsed = parseExtraction(JSON.stringify({
      ...base,
      isOnlinePurchase: true,
      storeDomain: "Amazon EU S.à r.l.",
      sellerCountry: "LU",
    }), { storeDomain: "Amazon.es <auto-confirm@amazon.es>" });
    expect(parsed.purchaseCountry).toBe("ES");
  });

  it("does not let a delivery address rewrite an in-store country", () => {
    const parsed = parseExtraction(JSON.stringify({
      ...base,
      isOnlinePurchase: false,
      purchaseCountry: "PT",
      deliveryCountry: "ES",
      storeDomain: "amazon.es",
      sellerCountry: "LU",
    }));
    expect(parsed.purchaseCountry).toBe("PT");
  });
});
