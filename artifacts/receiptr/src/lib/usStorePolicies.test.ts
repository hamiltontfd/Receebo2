import { describe, expect, it } from "vitest";
import { findUsStorePolicy, usItemKinds, usStoreReturnWindow } from "./usStorePolicies";

const w = (merchant: string, purchaseDate: string, extra: Record<string, unknown> = {}) =>
  usStoreReturnWindow({ merchant, purchaseDate, ...extra });

describe("US store table: recognition", () => {
  it.each([
    ["AMAZON.COM", "amazon"], ["AMZN Mktp US", "amazon"], ["Amazon", "amazon"],
    ["WAL-MART #1234", "walmart"], ["Walmart.com", "walmart"], ["WM SUPERCENTER", "walmart"],
    ["TARGET T-1234", "target"], ["Target", "target"], ["target.com", "target"],
    ["BEST BUY #512", "bestbuy"], ["BestBuy.com", "bestbuy"],
    ["COSTCO WHSE #123", "costco"], ["The Home Depot", "homedepot"], ["HOME DEPOT 6543", "homedepot"],
    ["Apple Store", "apple"], ["Apple", "apple"], ["APPLE.COM/US", "apple"],
    ["Macy's", "macys"], ["MACYS.COM", "macys"],
  ])("%s -> %s", (merchant, key) => {
    expect(findUsStorePolicy(merchant)?.key).toBe(key);
  });
  it.each(["eBay", "Etsy", "Amazon via eBay", "Corner Shop", "Targeted Nutrition", "Pineapple Express", "", null])("%s is unknown", (merchant) => {
    expect(findUsStorePolicy(merchant as string | null)).toBeNull();
  });
});

describe("US store table: item kinds", () => {
  it("detects phones, Apple, TVs, appliances, and skips look-alikes", () => {
    expect(usItemKinds("Apple iPhone 16 128GB")).toEqual(expect.arrayContaining(["apple", "phone", "electronics"]));
    expect(usItemKinds('LG 65" OLED TV')).toContain("tv");
    expect(usItemKinds("TV wall mount")).not.toContain("tv");
    expect(usItemKinds("Samsung 28 cu ft French door refrigerator")).toContain("major_appliance");
    expect(usItemKinds("Conair hair dryer")).not.toContain("major_appliance");
    expect(usItemKinds("Ryobi pressure washer")).not.toContain("major_appliance");
    expect(usItemKinds("Cotton T-shirt")).toEqual([]);
  });
});

describe("US store table: windows (online and in store)", () => {
  it("Best Buy: 15 days, from delivery when known, in store from purchase", () => {
    expect(w("Best Buy", "2026-10-01", { isOnlinePurchase: false })).toMatchObject({ status: "window", days: 15, startsFrom: "purchase", deadline: "2026-10-16", holiday: false });
    expect(w("Best Buy", "2026-10-01", { isOnlinePurchase: true, deliveryDate: "2026-10-05" })).toMatchObject({ deadline: "2026-10-20", startsFrom: "delivery" });
    // A delivery date on an in-store receipt is ignored.
    expect(w("Best Buy", "2026-10-01", { isOnlinePurchase: false, deliveryDate: "2026-10-05" })).toMatchObject({ deadline: "2026-10-16" });
    expect(w("Best Buy", "2026-10-01", { itemNames: ["Samsung Galaxy S25"] })).toMatchObject({ days: 14, rule: "activatable devices" });
  });
  it("Best Buy holiday 2026: purchases Oct 30 - Dec 31 return by Jan 15, 2027", () => {
    expect(w("Best Buy", "2026-11-27")).toMatchObject({ deadline: "2027-01-15", holiday: true });
    expect(w("Best Buy", "2026-10-29")).toMatchObject({ deadline: "2026-11-13", holiday: false });
  });
  it("Amazon: 30 days from delivery; Apple products 15; holiday Jan 31 (Apple Jan 15)", () => {
    expect(w("Amazon.com", "2026-10-01", { deliveryDate: "2026-10-03" })).toMatchObject({ days: 30, deadline: "2026-11-02", startsFrom: "delivery" });
    expect(w("Amazon.com", "2026-10-01", { itemNames: ["Apple AirPods Pro 2"] })).toMatchObject({ days: 15, rule: "Apple products" });
    expect(w("Amazon.com", "2026-11-27")).toMatchObject({ deadline: "2027-01-31", holiday: true });
    expect(w("Amazon.com", "2026-11-27", { itemNames: ["Apple iPad Air"] })).toMatchObject({ deadline: "2027-01-15", holiday: true });
  });
  it("Walmart: 90; electronics 30; phones 14; major appliances 2; holiday excludes phones and appliances", () => {
    expect(w("Walmart", "2026-09-01")).toMatchObject({ days: 90, deadline: "2026-11-30" });
    expect(w("Walmart", "2026-09-01", { category: "Electronics" })).toMatchObject({ days: 30 });
    expect(w("Walmart", "2026-09-01", { itemNames: ["onn. 50\" 4K TV"] })).toMatchObject({ days: 30 });
    expect(w("Walmart", "2026-09-01", { itemNames: ["iPhone 15"] })).toMatchObject({ days: 14 });
    expect(w("Walmart", "2026-09-01", { itemNames: ["GE top load washer"] })).toMatchObject({ days: 2, deadline: "2026-09-03" });
    expect(w("Walmart", "2026-11-27", { itemNames: ["onn. 50\" 4K TV"] })).toMatchObject({ deadline: "2027-01-31", holiday: true });
    expect(w("Walmart", "2026-11-27", { itemNames: ["iPhone 15"] })).toMatchObject({ deadline: "2026-12-11", holiday: false });
  });
  it("a receipt with several items uses its shortest window and says which rule", () => {
    expect(w("Target", "2026-09-01", { itemNames: ["Throw pillow", "Beats Studio Buds", "Lamp"] })).toMatchObject({ days: 14, rule: "Apple, Beats and cell phones" });
  });
  it("Costco: no fixed window except electronics and appliances (90 days)", () => {
    expect(w("COSTCO WHSE", "2026-09-01", { itemNames: ["Kirkland paper towels"] })).toMatchObject({ status: "no_fixed_window" });
    expect(w("COSTCO WHSE", "2026-09-01", { itemNames: ["Kirkland paper towels", "Sony 75\" TV"] })).toMatchObject({ status: "window", days: 90 });
  });
  it("Home Depot, Apple, Macy's", () => {
    expect(w("The Home Depot", "2026-09-01", { itemNames: ["Whirlpool dishwasher"] })).toMatchObject({ days: 2 });
    expect(w("The Home Depot", "2026-09-01", { itemNames: ["DeWalt drill"] })).toMatchObject({ days: 90 });
    expect(w("Apple Store", "2026-09-01")).toMatchObject({ days: 14 });
    expect(w("Macy's", "2026-11-20")).toMatchObject({ deadline: "2027-01-31", holiday: true });
  });
  it("unknown store, eBay/Etsy and bad dates get no window", () => {
    expect(w("Corner Shop", "2026-09-01")).toEqual({ status: "unknown" });
    expect(w("eBay", "2026-09-01")).toEqual({ status: "unknown" });
    expect(w("Best Buy", "not-a-date")).toEqual({ status: "unknown" });
  });
});
