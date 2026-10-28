import { describe, expect, it } from "vitest";
import { itemsPhrase, reminderItemNames, renderReturnReminder, renderWarrantyReminder } from "./reminderCopy";

const sony = {
  merchant: "Worten",
  products: [{ name: "Cable", price: 9.99 }, { name: "Sony WH-1000XM5 headphones", price: 349 }, { name: "Case", price: 19 }],
  total: 377.98, currency: "EUR", purchaseDate: "2026-10-12",
};

describe("reminder items", () => {
  it("first notable item, else the most expensive line; '+ N more' after two", () => {
    expect(reminderItemNames(sony)).toEqual(["Sony WH-1000XM5 headphones", "Case", "Cable"]);
    expect(reminderItemNames({ ...sony, notableItems: [{ name: "Case" }] })[0]).toBe("Case");
    expect(itemsPhrase(["A"])).toBe("A");
    expect(itemsPhrase(["A", "B"])).toBe("A and B");
    expect(itemsPhrase(["A", "B", "C", "D"])).toBe("A, B + 2 more");
    expect(itemsPhrase(["x".repeat(60)])).toHaveLength(40);
  });
});

describe("return reminder copy", () => {
  const deadline = new Date("2026-10-31T00:00:00Z");
  it("with product and amount", () => {
    const m = renderReturnReminder({ ...sony, deadline, daysRemaining: 7, basis: "law", windowDays: 14 });
    expect(m.subject).toBe("Return window for Sony WH-1000XM5 headphones (€377.98) closes in 7 days");
    expect(m.preheader).toBe("Bought at Worten on 12 Oct 2026. Last day: 31 Oct 2026.");
    expect(m.title).toBe("Sony WH-1000XM5 headphones: return window closes 31 Oct 2026");
    expect(m.itemLine).toBe("Sony WH-1000XM5 headphones, Case + 1 more · €377.98 · Worten, bought 12 Oct 2026");
    expect(m.secondary).toBe("Still happy with your Sony WH-1000XM5 headphones?");
    expect(m.note).toBe("Based on the 14-day withdrawal period for online purchases.");
    expect(m.push).toEqual({ title: "Return window closes in 7 days", body: "Sony WH-1000XM5 headphones · €377.98 · Worten" });
  });
  it("tomorrow, last day, and store policy", () => {
    expect(renderReturnReminder({ ...sony, deadline, daysRemaining: 1 }).subject).toBe("Return window for Sony WH-1000XM5 headphones (€377.98) closes tomorrow");
    const last = renderReturnReminder({ ...sony, deadline, daysRemaining: 0, basis: "store" });
    expect(last.subject).toBe("Last day to return Sony WH-1000XM5 headphones (€377.98)");
    expect(last.push.title).toBe("Last day to return");
    expect(last.note).toBe("Based on Worten's return policy. Conditions vary, so check your receipt or the store's site.");
  });
  it("without an amount, '({Amount})' disappears entirely", () => {
    const m = renderReturnReminder({ ...sony, total: null, deadline, daysRemaining: 2 });
    expect(m.subject).toBe("Return window for Sony WH-1000XM5 headphones closes in 2 days");
    expect(m.itemLine).toBe("Sony WH-1000XM5 headphones, Case + 1 more · Worten, bought 12 Oct 2026");
    expect(m.push.body).toBe("Sony WH-1000XM5 headphones · Worten");
  });
  it("without a product name: 'your {Merchant} purchase', never 'Still happy with…'", () => {
    const withAmount = renderReturnReminder({ merchant: "Zara", total: 59.9, currency: "EUR", purchaseDate: "2026-10-12", deadline, daysRemaining: 3 });
    expect(withAmount.subject).toBe("Return window for your Zara purchase (€59.90) closes in 3 days");
    expect(withAmount.title).toBe("Your Zara purchase: return window closes 31 Oct 2026");
    expect(withAmount.secondary).toBeNull();
    expect(withAmount.push.body).toBe("Zara purchase · €59.90");
    const bare = renderReturnReminder({ merchant: "Zara", purchaseDate: "2026-10-12", deadline, daysRemaining: 3 });
    expect(bare.subject).toBe("Return window for your Zara purchase from 12 Oct 2026 closes in 3 days");
  });
  it("keeps the push body within ~60 characters", () => {
    const m = renderReturnReminder({ ...sony, products: [{ name: "A very long product name that keeps going and going on", price: 1 }], deadline, daysRemaining: 2 });
    expect(m.push.body.length).toBeLessThanOrEqual(60);
    expect(m.push.body).toMatch(/… · €377\.98 · Worten$/);
  });
});

describe("warranty reminder copy", () => {
  it("legal, with the other warranty line", () => {
    const m = renderWarrantyReminder({ ...sony, kind: "legal", expiresOn: "2029-10-12", other: { kind: "manufacturer", expiresOn: "2030-10-12" } });
    expect(m.subject).toBe("Legal warranty for Sony WH-1000XM5 headphones (€377.98) ends on 12 Oct 2029");
    expect(m.title).toBe("Sony WH-1000XM5 headphones: legal warranty ends 12 Oct 2029");
    expect(m.body).toContain("contact Worten before 12 Oct 2029");
    expect(m.note).toBe("Your manufacturer warranty is separate and runs until 12 Oct 2030.");
    expect(m.push).toEqual({ title: "Legal warranty ends 12 Oct 2029", body: "Sony WH-1000XM5 headphones · €377.98 · Worten" });
  });
  it("manufacturer, without amount or product", () => {
    const m = renderWarrantyReminder({ merchant: "Worten", purchaseDate: "2024-10-12", kind: "manufacturer", expiresOn: "2026-10-12" });
    expect(m.subject).toBe("Manufacturer warranty for your Worten purchase from 12 Oct 2024 ends on 12 Oct 2026");
    expect(m.body).toContain("contact the manufacturer before 12 Oct 2026");
    expect(m.secondary).toBeNull();
    expect(m.note).toBeNull();
  });
});
