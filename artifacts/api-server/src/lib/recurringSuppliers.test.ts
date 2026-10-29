import { describe, expect, it } from "vitest";
import type { RecurringSupplierRow } from "@workspace/db";
import {
  buildSupplierRules, buildSupplierViews, isMixedStoreKey, looksRepeated, pendingSupplierItem, recurringKind,
  registrableDomain, shortSupplierName, sortSupplierViews, supplierKey, type SupplierItem,
} from "./recurringSuppliers";

const item = (over: Partial<SupplierItem>): SupplierItem => ({
  source: "receipt", id: 1, merchant: null, purchaseType: null, category: null, summary: null,
  productNames: [], senderDomain: null, purchaseDate: "2026-10-01", total: 10, currency: "EUR", ...over,
});
const row = (over: Partial<RecurringSupplierRow>): RecurringSupplierRow => ({
  id: 1, userId: "u", supplierKey: "edp", displayName: "EDP Comercial", kind: "utility", status: "on",
  category: null, senderDomains: [], createdAt: new Date(), updatedAt: new Date(), ...over,
});

describe("supplier identity", () => {
  it("groups several names of one supplier under a key and shows the short name", () => {
    expect(supplierKey("EDP Comercial")).toBe("edp");
    expect(supplierKey("EDP Comercial – Comercialização de Energia, S.A.")).toBe("edp");
    expect(shortSupplierName("EDP Comercial – Comercialização de Energia, S.A.")).toBe("EDP Comercial");
    expect(supplierKey("Netflix International B.V.")).toBe("netflix");
    expect(supplierKey("Spotify AB")).toBe("spotify");
    expect(supplierKey("Disney+")).toBe("disney-plus");
  });

  it("slugs other merchants without legal or generic tails; falls back to a non-shared sender domain", () => {
    expect(shortSupplierName("Ginásio Fit Lda")).toBe("Ginásio Fit");
    expect(supplierKey("Ginásio Fit, Lda")).toBe("ginasio-fit");
    expect(supplierKey("Acme Cloud Services")).toBe("acme-cloud");
    expect(supplierKey(null, "billing.acme.io")).toBe("acme.io");
    expect(supplierKey(null, "gmail.com")).toBeNull();
    expect(supplierKey(null, "mail.paypal.com")).toBeNull();
    expect(registrableDomain("faturas.example.com.pt")).toBe("example.com.pt");
  });
});

describe("recurring detection", () => {
  it("utility: known brand, utility sender domain, water merchants or utility text", () => {
    expect(recurringKind("edp", [item({ merchant: "EDP Comercial" })])).toBe("utility");
    expect(recurringKind("x", [item({ merchant: "X", senderDomain: "galp.pt" })])).toBe("utility");
    expect(recurringKind("aguas-do-norte", [item({ merchant: "Águas do Norte" })])).toBe("utility");
    expect(recurringKind("luz-boa", [item({ merchant: "Luz Boa", summary: "Fatura de eletricidade de outubro" })])).toBe("utility");
  });

  it("subscription: known brand, subscription purchase type, or the same amount over 3+ months", () => {
    expect(recurringKind("netflix", [item({ merchant: "Netflix" })])).toBe("subscription");
    expect(recurringKind("acme", [item({ merchant: "Acme", purchaseType: "subscription" })])).toBe("subscription");
    const monthly = ["2026-08-03", "2026-09-03", "2026-10-03"].map((d, i) => item({ id: i, merchant: "Gym", purchaseDate: d, total: 30 + i }));
    expect(looksRepeated(monthly)).toBe(true);
    expect(recurringKind("gym", monthly)).toBe("subscription");
  });

  it("one-off shops are not recurring", () => {
    expect(recurringKind("worten", [item({ merchant: "Worten", purchaseType: "goods" })])).toBeNull();
    expect(looksRepeated([item({ purchaseDate: "2026-08-01" }), item({ purchaseDate: "2026-09-01" })])).toBe(false);
    expect(looksRepeated(["2026-08-01", "2026-09-01", "2026-10-01"].map((d, i) => item({ purchaseDate: d, total: [10, 50, 200][i] })))).toBe(false);
  });
});

describe("supplier views", () => {
  it("counts receipts and pendings, takes the last receipt, keeps the decision and sorts on first", () => {
    const views = buildSupplierViews([
      item({ id: 1, merchant: "EDP Comercial – Comercialização de Energia, S.A.", purchaseDate: "2026-09-20", total: 58, category: "Home" }),
      item({ id: 2, merchant: "EDP Comercial", purchaseDate: "2026-10-21", total: 61.2, category: "Home" }),
      item({ id: 3, source: "pending", merchant: "EDP Comercial", purchaseDate: "2026-10-27", total: 60 }),
      item({ id: 4, merchant: "Netflix", purchaseDate: "2026-10-01", total: 13.99, category: "Entertainment" }),
      item({ id: 5, merchant: "Worten", purchaseType: "goods" }),
    ], [row({ supplierKey: "netflix", displayName: "Netflix", kind: "subscription", status: "on" })]);
    expect([...views.keys()].sort()).toEqual(["edp", "netflix"]);
    expect(views.get("edp")).toMatchObject({
      displayName: "EDP Comercial", kind: "utility", status: "undecided", category: "Home",
      receiptCount: 2, lastReceiptDate: "2026-10-21", lastAmount: 61.2, pendingCount: 1, pendingIds: [3],
    });
    expect(sortSupplierViews(views.values()).map((v) => v.supplierKey)).toEqual(["netflix", "edp"]);
  });
});

describe("sync rules", () => {
  const rules = buildSupplierRules([
    row({ supplierKey: "edp", status: "on", senderDomains: ["edp.pt"] }),
    row({ id: 2, supplierKey: "netflix", displayName: "Netflix", kind: "subscription", status: "off", senderDomains: ["netflix.com"] }),
    row({ id: 3, supplierKey: "acme", status: "on", senderDomains: [] }),
  ]);

  it("matches a sender by learned domain or brand display name", () => {
    expect(rules.forSender("EDP <faturas@edp.pt>")?.status).toBe("on");
    expect(rules.forSender("<info@mailer.netflix.com>")?.status).toBe("off");
    expect(rules.forSender("Netflix <no-reply@gmail.com>")?.status).toBe("off");
    expect(rules.forSender("Shop <a@shop.pt>")).toBeNull();
  });

  it("matches an extracted receipt by merchant key, else by sender", () => {
    expect(rules.forReceipt("Acme", "acme.io")?.supplierKey).toBe("acme");
    expect(rules.forReceipt("EDP Comercial, S.A.", null)?.status).toBe("on");
    expect(rules.forReceipt("Something", "edp.pt")?.supplierKey).toBe("edp");
    expect(rules.forReceipt("Worten", "worten.pt")).toBeNull();
  });

  it("undecided rows never drive sync", () => {
    expect(buildSupplierRules([row({ status: "undecided" as any, senderDomains: ["edp.pt"] })]).forSender("<a@edp.pt>")).toBeNull();
  });
});

describe("mixed stores (Apple, Google, Microsoft) and pending purchase types", () => {
  const applePending = (id: number, over: Record<string, unknown>) => pendingSupplierItem({
    id,
    extractionData: {
      merchant: "Apple", purchaseDate: "2026-10-20", total: 30.95, currency: "EUR", category: "Entertainment",
      summary: null, ocrText: null, warranty: null, transactionNumber: null, products: [], ...over,
    } as never,
  })!;

  it("a pending import from before purchase types existed uses the hint the sheet shows (Apple One → subscription)", () => {
    const apple = applePending(7, { products: [{ name: "Apple One Premium Subscription" }] });
    expect(apple.purchaseType).toBe("subscription");
    const view = buildSupplierViews([apple], []).get("apple");
    expect(view).toMatchObject({ kind: "subscription", status: "undecided", pendingIds: [7] });
  });

  it("one key for Apple's merchant names", () => {
    expect(supplierKey("Apple Distribution International Ltd.")).toBe("apple");
    expect(supplierKey("Apple")).toBe("apple");
    expect(supplierKey("Google Payment Ireland Limited")).toBe("google");
    expect(isMixedStoreKey("apple")).toBe(true);
    expect(isMixedStoreKey("netflix")).toBe(false);
  });

  it("only subscription items belong to a mixed store's supplier", () => {
    const sub = applePending(1, { products: [{ name: "iCloud+ 200 GB" }] });
    const app = applePending(2, { purchaseType: "digital", products: [{ name: "Some Game" }] });
    const hardware = item({ id: 3, merchant: "Apple", purchaseType: "goods", total: 1299 });
    const views = buildSupplierViews([sub, app, hardware], []);
    expect(views.get("apple")).toMatchObject({ pendingIds: [1], pendingCount: 1, receiptCount: 0 });
    // Only one-off purchases: Apple is not a recurring supplier at all.
    expect(buildSupplierViews([app, hardware], []).get("apple")).toBeUndefined();
  });

  it("an Apple decision applies to Apple subscriptions only", () => {
    const rules = buildSupplierRules([
      row({ supplierKey: "apple", displayName: "Apple", kind: "subscription", status: "on" }),
      row({ id: 2, supplierKey: "google", displayName: "Google", kind: "subscription", status: "off" }),
    ]);
    expect(rules.forReceipt("Apple", "email.apple.com", "subscription")?.status).toBe("on");
    expect(rules.forReceipt("Apple", "email.apple.com", "digital")).toBeNull();
    expect(rules.forReceipt("Apple", "orders.apple.com", "goods")).toBeNull();
    expect(rules.forReceipt("Apple", "email.apple.com", null)).toBeNull();
    expect(rules.forReceipt("Google Payment Ireland", "google.com", "subscription")?.status).toBe("off");
    expect(rules.forReceipt("Google Payment Ireland", "google.com", "digital")).toBeNull();
    // Never decided before the AI read (apple.com is a shared sender domain).
    expect(rules.forSender("Apple <no_reply@email.apple.com>")).toBeNull();
  });
});
