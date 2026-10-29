import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@workspace/api-client-react";
import {
  classifyReceipt, deadlineUrgency, durableKeeping, expiringChart, isDurableReceipt, formatAmount, formatShortDate, summarizeProtected, worthKeeping,
} from "./protectedValue";

const NOW = new Date(2026, 9, 29, 9, 0, 0); // 29 Oct 2026

function rc(over: Partial<Receipt> & { id: number }): Receipt {
  return {
    objectPath: "/objects/x", originalFileName: `r${over.id}.jpg`, contentType: "image/jpeg",
    status: "completed", createdAt: "2026-10-20T10:00:00Z", currency: "EUR", purchaseCountry: "PT",
    category: "Electronics", merchant: `Store ${over.id}`, total: 10, ...over,
  } as Receipt;
}

const tvOnline = rc({ id: 1, purchaseDate: "2026-10-20", isOnlinePurchase: true, total: 649, merchant: "Casa Lumen",
  notableItems: [{ name: "55\" 4K Smart TV", price: 599, reason: "warranty" }] });
const vacuum = rc({ id: 2, category: "Home", purchaseDate: "2024-01-10", isOnlinePurchase: false, total: 229,
  notableItems: [{ name: "Cordless vacuum", price: 229, reason: "warranty" }] });
const subscription = rc({ id: 3, purchaseType: "subscription", purchaseDate: "2026-10-01", total: 9.99 });
const groceries = rc({ id: 4, category: "Groceries", purchaseDate: "2026-10-25", isOnlinePurchase: false, total: 38.47 });
const noDate = rc({ id: 5, purchaseDate: null, total: 142.5 });
const old = rc({ id: 6, purchaseDate: "2020-01-01", isOnlinePurchase: false, total: 80 });
const usOnline = rc({ id: 7, currency: "USD", purchaseCountry: "US", merchant: "Amazon.com", purchaseDate: "2026-10-25",
  isOnlinePurchase: true, total: 349 });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("classifyReceipt", () => {
  it("puts an open return window in Return, counted from today", () => {
    const res = classifyReceipt(tvOnline, NOW);
    expect(res.kind).toBe("entry");
    if (res.kind !== "entry") return;
    expect(res.entry.bucket).toBe("return");
    expect(res.entry.daysLeft).toBe(5);
    expect(res.entry.title).toBe("55\" 4K Smart TV");
    expect(res.entry.amount).toBe(649);
  });
  it("moves to Warranty once the return window is closed (PT legal warranty, 3 years)", () => {
    const res = classifyReceipt(vacuum, NOW);
    expect(res.kind === "entry" && res.entry.bucket).toBe("warranty");
    if (res.kind === "entry") expect(res.entry.deadline?.getFullYear()).toBe(2027);
  });
  it("excludes subscriptions, services, digital and tickets", () => {
    for (const t of ["subscription", "service", "digital", "ticket"] as const) {
      expect(classifyReceipt(rc({ id: 9, purchaseType: t, purchaseDate: "2026-10-01" }), NOW).kind).toBe("excluded");
    }
  });
  it("never counts groceries or expired protection; unknown when no deadline can be derived", () => {
    expect(classifyReceipt(groceries, NOW).kind).toBe("none");
    expect(classifyReceipt(old, NOW).kind).toBe("expired");
    const unk = classifyReceipt(noDate, NOW);
    expect(unk.kind === "entry" && unk.entry.bucket).toBe("unknown");
  });
  it("skips receipts still processing or without a total", () => {
    expect(classifyReceipt(rc({ id: 10, status: "processing" }), NOW).kind).toBe("none");
    expect(classifyReceipt(rc({ id: 11, total: null, purchaseDate: "2026-10-20" }), NOW).kind).toBe("none");
  });
});

describe("summarizeProtected", () => {
  const all = [tvOnline, vacuum, subscription, groceries, noDate, old, usOnline];
  it("sums counted receipts once, per currency, never converting", () => {
    const s = summarizeProtected(all, NOW);
    expect(s.primaryCurrency).toBe("EUR");
    expect(s.total).toBe(878);
    expect(s.otherTotals).toEqual([{ currency: "USD", amount: 349 }]);
    expect(s.groups.return).toEqual({ count: 2, amount: 649 });
    expect(s.groups.warranty).toEqual({ count: 1, amount: 229 });
    expect(s.groups.unknown).toEqual({ count: 1, amount: 142.5 });
    expect(s.excludedCount).toBe(1);
    expect(s.expiredCount).toBe(1);
    expect(s.counted.map((e) => e.receiptId)).toEqual([1, 7, 2]);
  });
  it("is empty and EUR with no receipts", () => {
    const s = summarizeProtected([], NOW);
    expect(s.total).toBe(0);
    expect(s.primaryCurrency).toBe("EUR");
    expect(s.counted).toEqual([]);
  });
});

describe("expiringChart", () => {
  it("buckets the primary currency into weekly bars within the range", () => {
    const s = summarizeProtected([tvOnline, vacuum, usOnline], NOW);
    const c30 = expiringChart(s, 30, NOW);
    expect(c30.bars).toHaveLength(5);
    expect(c30.bars[0].returnAmount).toBe(649);
    expect(c30.total).toBe(649);
    expect(c30.warrantyTotal).toBe(0);
    const c90 = expiringChart(s, 90, NOW);
    expect(c90.bars).toHaveLength(13);
    expect(c90.total).toBe(878);
    expect(c90.warrantyTotal).toBe(229);
    // Today is 29 Oct: the first bar is the last days of October, so the labels start at Nov.
    expect(c90.bars[0].monthLabel).toBeNull();
    expect(c90.bars.filter((b) => b.monthLabel).map((b) => b.monthLabel)).toEqual(["Nov", "Dec", "Jan"]);
  });
});

describe("worthKeeping", () => {
  it("lists notable items of protected receipts, most valuable first, with the protection date", () => {
    const list = [tvOnline, vacuum, noDate];
    const items = worthKeeping(list, summarizeProtected(list, NOW), NOW);
    expect(items.map((i) => [i.name, i.caption])).toEqual([
      ["55\" 4K Smart TV", "Return by 3 Nov"],
      ["Cordless vacuum", "Warranty to 10 Jan 2027"],
    ]);
  });
  it("falls back to recent notable items with the merchant when nothing is protected", () => {
    const expiredTv = rc({ id: 12, purchaseDate: "2020-01-01", notableItems: [{ name: "Old TV", price: 300, reason: "" }], merchant: "Worten" });
    const items = worthKeeping([expiredTv], summarizeProtected([expiredTv], NOW), NOW);
    expect(items).toEqual([expect.objectContaining({ name: "Old TV", caption: "Worten" })]);
  });
});

describe("formatting", () => {
  it("formats dates en-GB style, year only when it isn't this year; US style for USD", () => {
    expect(formatShortDate(new Date(2026, 9, 30), NOW)).toBe("30 Oct");
    expect(formatShortDate(new Date(2028, 2, 3), NOW)).toBe("3 Mar 2028");
    expect(formatShortDate(new Date(2026, 10, 12), NOW, true)).toBe("Nov 12");
  });
  it("formats amounts with the currency symbol", () => {
    expect(formatAmount(2431.8, "EUR")).toBe("€2,431.80");
    expect(formatAmount(349, "USD")).toBe("$349.00");
  });
  it("uses the receipt-sheet urgency colours", () => {
    expect(deadlineUrgency(2, "return")).toBe("red");
    expect(deadlineUrgency(10, "warranty")).toBe("amber");
    expect(deadlineUrgency(30, "return")).toBe("none");
    expect(deadlineUrgency(null, "unknown")).toBe("none");
  });
});

describe("durableKeeping (Search home row and See all)", () => {
  const n = (name: string, price: number, category?: string) => ({ name, price, reason: "", ...(category ? { category } : {}) });
  const laptop = rc({ createdAt: "2026-10-28T12:00:00Z", id: 20, purchaseDate: "2026-10-25", isOnlinePurchase: true, total: 899, notableItems: [n("Laptop", 899)] });
  const tv = rc({ createdAt: "2026-10-28T12:00:00Z", id: 21, purchaseDate: "2026-10-20", isOnlinePurchase: true, total: 649, notableItems: [n("Smart TV", 599)] });
  const chair = rc({ createdAt: "2026-10-28T12:00:00Z", id: 22, category: "Home", purchaseDate: "2026-10-27", isOnlinePurchase: false, total: 129, notableItems: [n("Desk chair", 129)] });
  const vac = rc({ createdAt: "2026-10-28T12:00:00Z", id: 23, category: "Home", purchaseDate: "2024-01-10", isOnlinePurchase: false, total: 229, notableItems: [n("Cordless vacuum", 229)] });
  const ancient = rc({ createdAt: "2026-10-28T12:00:00Z", id: 24, purchaseDate: "2020-01-01", isOnlinePurchase: false, total: 80, notableItems: [n("Old drill", 80)] });
  const sub = rc({ createdAt: "2026-10-28T12:00:00Z", id: 25, purchaseType: "subscription", purchaseDate: "2026-10-28", total: 99, notableItems: [n("Annual plan", 99)] });
  const service = rc({ createdAt: "2026-10-28T12:00:00Z", id: 26, purchaseType: "service", purchaseDate: "2026-10-28", total: 60, notableItems: [n("Repair", 60)] });
  const grocery = rc({ createdAt: "2026-10-28T12:00:00Z", id: 27, category: "Groceries", purchaseDate: "2026-10-28", total: 120, notableItems: [n("Olive oil 5L", 60)] });
  const mixed = rc({ createdAt: "2026-10-28T12:00:00Z", id: 28, category: "Home", purchaseDate: "2026-09-01", isOnlinePurchase: false, total: 300,
    notableItems: [n("Coffee beans", 55, "Groceries"), n("Espresso machine", 245)] });
  const draft = rc({ createdAt: "2026-10-28T12:00:00Z", id: 29, isDraft: true, purchaseDate: "2026-10-28", total: 500, notableItems: [n("Draft TV", 500)] });
  const plain = rc({ createdAt: "2026-10-28T12:00:00Z", id: 30, purchaseDate: "2026-10-28", total: 40 }); // no notable items
  const all = [ancient, sub, vac, tv, service, grocery, mixed, chair, laptop, draft, plain];

  it("only durable goods: no subscriptions, services, groceries, drafts or receipts without notable items", () => {
    expect([sub, service, grocery, draft].map(isDurableReceipt)).toEqual([false, false, false, false]);
    expect(isDurableReceipt(rc({ id: 31, purchaseType: null }))).toBe(true);
    const names = durableKeeping(all, NOW).map((i) => i.name);
    expect(names).not.toContain("Annual plan");
    expect(names).not.toContain("Repair");
    expect(names).not.toContain("Olive oil 5L");
    expect(names).not.toContain("Coffee beans");
    expect(names).not.toContain("Draft TV");
  });

  it("open return windows first (most recent purchase first), then the rest by most recent purchase", () => {
    const items = durableKeeping(all, NOW);
    expect(items.map((i) => i.name)).toEqual(["Laptop", "Smart TV", "Desk chair", "Espresso machine", "Cordless vacuum", "Old drill"]);
    expect(items.map((i) => i.status)).toEqual(["return", "return", "warranty", "warranty", "warranty", "none"]);
    expect(items[1].caption).toBe("Return by 3 Nov");
    expect(items[2].caption).toMatch(/^Warranty to /);
    expect(items[5].caption).toBe("Store 24");
  });

  it("a receipt without a purchase date sorts by the day it was added", () => {
    const undated = rc({ id: 40, purchaseDate: null, createdAt: "2026-10-26T10:00:00Z", total: 300, notableItems: [n("Speaker", 300)] });
    const items = durableKeeping([chair, undated, vac], NOW);
    expect(items[0].day >= items[1].day).toBe(true);
    expect(items.find((i) => i.name === "Speaker")!.day).toBe("2026-10-26");
  });
});
