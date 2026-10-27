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
  it("does not move the legal warranty (still from purchase)", () => {
    const base = { purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Shop", category: "Electronics" };
    const a = deriveConsumerRights({ ...base, purchaseDate: "2026-01-10", deliveryDate: "2026-01-20" });
    const b = deriveConsumerRights({ ...base, purchaseDate: "2026-01-10" });
    expect(a.warranty?.expiry.getTime()).toBe(b.warranty?.expiry.getTime());
  });
  it("ignores an impossible delivery date", () => {
    expect(returnWindowStartDate("2026-10-10", "2026-10-01")).toEqual({ date: "2026-10-10", from: "purchase" });
    expect(returnWindowStartDate("2026-10-10", "2026-10-11")).toEqual({ date: "2026-10-11", from: "delivery" });
  });
});
