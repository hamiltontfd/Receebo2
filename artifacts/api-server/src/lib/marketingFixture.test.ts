import { describe, expect, it } from "vitest";
import { euCapture, usCapture, brCapture } from "../../../receiptr/scripts/marketing/fixtures.mjs";
import { findUsStorePolicy } from "./usStorePolicies";
import { acceptExtractedLines, evaluateItemRights } from "./itemCoverage";

const euAsOf = "2026-10-27";
const usAsOf = "2026-11-08";

function rightsFor(receipt: { products: unknown; category?: string | null; purchaseDate: string; merchant: string; deliveryDate?: string | null; isOnlinePurchase?: boolean }, region: "PT" | "US") {
  return evaluateItemRights(receipt.products as never, {
    region,
    category: receipt.category,
    purchaseDate: receipt.purchaseDate,
    deliveryDate: receipt.deliveryDate ?? null,
    purchaseCountry: region === "US" ? "US" : "PT",
    currency: region === "US" ? "USD" : "EUR",
    merchant: receipt.merchant,
    isOnlinePurchase: receipt.isOnlinePurchase ?? false,
    purchaseType: "goods",
    asOf: region === "US" ? usAsOf : euAsOf,
  });
}

describe("marketing capture fixtures", () => {
  it("gives the fictional Casa Lumen sample two different manufacturer terms and does not copy one onto every line", () => {
    const receipt = euCapture.receipts[0];
    const [tv, soundbar, cable] = receipt.products;
    expect(tv.coverages?.[0]).toMatchObject({ warrantyType: "manufacturer", lengthMonths: 24, certainty: "estimated" });
    expect(soundbar.coverages?.[0]).toMatchObject({ warrantyType: "manufacturer", lengthMonths: 12, certainty: "estimated" });
    expect(cable.coverages).toBeUndefined();
    expect(receipt.warranty).not.toContain("soundbar");
    const rights = rightsFor(receipt, "PT");
    const tvMaker = rights[0].contracts.find((c) => c.warrantyType === "manufacturer");
    const barMaker = rights[1].contracts.find((c) => c.warrantyType === "manufacturer");
    const cableWarranty = rights[2].contracts.find((c) => c.warrantyType === "legal");
    expect(tvMaker).toMatchObject({ certainty: "estimated", status: "open", endDate: "2028-10-23", lengthMonths: 24 });
    expect(barMaker).toMatchObject({ certainty: "estimated", status: "open", endDate: "2027-10-23", lengthMonths: 12 });
    expect(rights[0].contracts.find((c) => c.ruleId === "PT:DL-84/2021")).toMatchObject({ certainty: "estimated", endDate: "2029-10-25" });
    expect(cableWarranty).toMatchObject({
      kind: "warranty", warrantyType: "legal", basis: "rule", certainty: "estimated",
      status: "open", lengthMonths: 36, startDate: receipt.deliveryDate,
      endDate: "2029-10-25", ruleId: "PT:DL-84/2021",
    });
    for (const line of rights.slice(2)) {
      expect(line.contracts.some(c => c.warrantyType === "manufacturer")).toBe(false);
    }
    expect(rights[2].contracts.find((c) => c.kind === "return")).toMatchObject({ status: "open", startDate: receipt.deliveryDate });
    expect(receipt.itemRights).toEqual(rights);
    expect(JSON.stringify(rights)).not.toContain("US:");
  });

  it("keeps the other fictional EU samples on the same Portugal evaluation", () => {
    expect(euCapture.market).toBe("PT");
    expect(euCapture.receipts).toHaveLength(4);
    for (const receipt of euCapture.receipts.slice(1)) {
      expect(receipt.itemRights).toEqual(rightsFor(receipt, "PT"));
      if (receipt.category === "Groceries") {
        expect(receipt.itemRights.every(line =>
          line.contracts.every(contract => contract.warrantyType !== "legal"))).toBe(true);
      }
    }
  });

  it("evaluates the US sample with stated periods and no Portugal rule", () => {
    expect(usCapture.market).toBe("US");
    expect(usCapture.locale).toBe("en-US");
    expect(usCapture.phone).toEqual({ width: 390, height: 844, deviceScaleFactor: 2 });
    expect(usCapture.receipts.length).toBeGreaterThanOrEqual(4);
    expect(usCapture.receipts.length).toBeLessThanOrEqual(6);
    for (const receipt of usCapture.receipts) {
      expect(receipt.currency).toBe("USD");
      expect(receipt.purchaseCountry).toBe("US");
      expect(findUsStorePolicy(receipt.merchant)).toBeNull();
      expect(receipt.itemRights).toEqual(rightsFor(receipt, "US"));
      const rules = receipt.itemRights.flatMap((row: { contracts: { ruleId: string | null }[] }) => row.contracts.map((c) => c.ruleId));
      expect(rules.some((id: string | null) => id?.startsWith("PT:") || id?.startsWith("EU:"))).toBe(false);
    }
    const hero = usCapture.receipts[0];
    const display = hero.itemRights[0].contracts;
    const speaker = hero.itemRights[1].contracts;
    expect(display.find((c: { warrantyType: string | null }) => c.warrantyType === "manufacturer")).toMatchObject({
      lengthMonths: 24, certainty: "estimated", status: "open", endDate: "2028-11-02",
    });
    expect(display.find((c: { kind: string; warrantyType: string | null }) => c.kind === "return" && c.warrantyType == null)).toMatchObject({
      lengthDays: 30, certainty: "estimated", status: "open", endDate: "2026-12-02",
    });
    expect(speaker.find((c: { warrantyType: string | null }) => c.warrantyType === "manufacturer")).toMatchObject({
      lengthMonths: 18, certainty: "estimated", status: "open", endDate: "2028-05-02",
    });
    expect(speaker.find((c: { kind: string; lengthDays: number | null }) => c.kind === "return" && c.lengthDays === 45)).toMatchObject({
      certainty: "estimated", endDate: "2026-12-17",
    });
    expect(display.find((c: { ruleId: string | null }) => c.ruleId === "US:no_federal_legal_warranty")).toMatchObject({ status: "not_applicable" });
    const cable = hero.itemRights[2].contracts;
    expect(cable.find((c: { kind: string }) => c.kind === "return")).toMatchObject({ status: "unknown", endDate: null });
    expect(cable.some((c: { kind: string; status: string }) => c.kind === "warranty" && c.status === "open")).toBe(false);
  });

  it("keeps the US stated periods only when the sample text names that line", () => {
    const hero = usCapture.receipts[0];
    const accepted = acceptExtractedLines(hero.products.map((line: { name: string; price: number; quantity: number; category?: string; coverages?: unknown[] }) => ({
      name: line.name,
      price: line.price,
      quantity: line.quantity,
      category: line.category,
      statedCoverages: line.coverages,
    })), { ocrText: hero.ocrText, receiptWarranty: hero.warranty });
    expect(accepted[0].coverages?.map((c) => c.lengthMonths ?? c.lengthDays)).toEqual([24, 30]);
    expect(accepted[1].coverages?.map((c) => c.lengthMonths ?? c.lengthDays)).toEqual([18, 45]);
    expect(accepted[2].coverages).toBeUndefined();
    expect(accepted[0].coverages?.every((c) => c.certainty === "estimated" && c.basis === "stated")).toBe(true);
  });

  it("locks the fictional Brazil collection to freshly evaluated CDC rights, not PT or US rules", () => {
    expect(brCapture).toMatchObject({ market: "BR", country: "BR", language: "pt-BR", locale: "pt-BR" });
    const hero = brCapture.receipts[0];
    expect(hero).toMatchObject({ isOnlinePurchase: true, purchaseCountry: "BR", deliveryDate: "2026-11-05" });
    expect(brCapture.receipts).toHaveLength(4);
    for (const receipt of brCapture.receipts) {
      expect(receipt.currency).toBe("BRL");
      expect(receipt.merchant).toContain("Fictíc");
      const fresh = evaluateItemRights(receipt.products, {
        region: "PT", // Non-US branch; BR purchase country selects CDC, not PT law.
        category: receipt.category,
        purchaseCountry: receipt.purchaseCountry,
        currency: receipt.currency,
        merchant: receipt.merchant,
        purchaseDate: receipt.purchaseDate,
        deliveryDate: receipt.deliveryDate,
        isOnlinePurchase: receipt.isOnlinePurchase,
        purchaseType: "goods",
        asOf: brCapture.capturedAt.slice(0, 10),
      });
      expect(receipt.itemRights).toEqual(fresh);
      if (receipt.category === "Groceries") {
        expect(fresh.every(line =>
          line.contracts.every(contract => contract.warrantyType !== "legal"))).toBe(true);
      }
      const rules = fresh.flatMap(row => row.contracts).filter(c => c.ruleId);
      expect(rules.every(c => !/^(PT|EU|US):/.test(c.ruleId!))).toBe(true);
      for (const contract of rules.filter(c => c.ruleId!.startsWith("BR:"))) {
        expect(contract.legalReviewPending).toBe(true);
      }
    }
    const contracts = hero.itemRights[0].contracts;
    expect(contracts.some(c => c.kind === "return" && c.basis === "rule" && c.status === "open")).toBe(true);
    expect(contracts.some(c => c.warrantyType === "legal" && c.legalReviewPending)).toBe(true);
    expect(contracts.some(c => c.warrantyType === "manufacturer")).toBe(true);
    const cable = hero.itemRights[2].contracts;
    expect(cable.find(c => c.warrantyType === "legal")).toMatchObject({
      kind: "warranty", basis: "rule", certainty: "estimated", status: "open",
      lengthDays: 90, startDate: hero.deliveryDate, endDate: "2027-02-03",
      ruleId: "BR:CDC-art-26", legalReviewPending: true,
    });
    expect(cable.some(c => c.warrantyType === "manufacturer")).toBe(false);
  });
});
