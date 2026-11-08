import sampleItemRights from "./sample-item-rights.json" with { type: "json" };
import usItemRights from "./us-item-rights.json" with { type: "json" };
import { usCapturedAt, usReceipts, usSearchQuery } from "./us-collection.mjs";

export const euCapturedAt = "2026-10-27T12:00:00Z";
// Illustrative capture collection only. itemRights is the saved output of
// evaluateItemRights for region PT on 2026-10-27, locked by marketingFixture.test.ts.
// It is not a store policy and it is not written to any account.
const base = {
  status: "completed", currency: "EUR", purchaseCountry: "PT",
  isOnlinePurchase: false, deliveryDate: null, isDraft: false, contentType: "image/png",
  objectPath: "/objects/sample-receipt.png", originalFileName: "casa-lumen-sample.png",
  attachments: [], transactionNumber: null, ocrText: "FICTIONAL SAMPLE RECEIPT",
};
const at = date => ({ createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z` });
const euReceipts = [
  {
    ...base, ...at("2026-10-23"), id: 901, merchant: "Casa Lumen Electrónica", category: "Electronics",
    purchaseDate: "2026-10-23", total: 649,
    products: [
      {
        lineId: "l_samplecasa0001", name: "55\" 4K Smart TV", price: 480, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [{
          id: "c_samplecasa0001", kind: "warranty", warrantyType: "manufacturer", basis: "stated",
          certainty: "estimated", lengthDays: null, lengthMonths: 24, endDate: null,
          evidence: "Illustrative sample text: 55\" 4K Smart TV, 2-year manufacturer warranty.", source: "extraction",
        }],
      },
      {
        lineId: "l_samplecasa0002", name: "Sample soundbar", price: 149, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [{
          id: "c_samplecasa0002", kind: "warranty", warrantyType: "manufacturer", basis: "stated",
          certainty: "estimated", lengthDays: null, lengthMonths: 12, endDate: null,
          evidence: "Illustrative sample text: Sample soundbar, 12-month manufacturer warranty.", source: "extraction",
        }],
      },
      { lineId: "l_samplecasa0003", name: "HDMI cable", price: 12, quantity: 1 },
      { lineId: "l_samplecasa0004", name: "Wall screws", price: 5, quantity: 1 },
      { lineId: "l_samplecasa0005", name: "Cleaning cloth", price: 3, quantity: 1 },
    ],
    notableItems: [
      { name: "55\" 4K Smart TV", price: 480, category: "Electronics", reason: "Illustrative sample highlight. Not a store policy." },
      { name: "Sample soundbar", price: 149, category: "Electronics", reason: "Illustrative sample highlight. Not a store policy." },
    ],
    summary: "In-store purchase at fictional Casa Lumen Electrónica. Sample only: a television and a soundbar with different manufacturer terms, plus small items with no stated coverage.",
    warranty: "Illustrative sample. The television line states a 2-year manufacturer warranty. This receipt text is not copied onto other items.",
  },
  {
    ...base, ...at("2026-10-12"), id: 902, merchant: "Casa & Jardim Braga", category: "Home",
    purchaseDate: "2026-10-12", total: 229,
    products: [{
      lineId: "l_samplejardim01", name: "Cordless vacuum", price: 229, quantity: 1,
      category: "Home", categorySource: "extraction",
      coverages: [{
        id: "c_samplejardim01", kind: "warranty", warrantyType: "manufacturer", basis: "stated",
        certainty: "estimated", lengthDays: null, lengthMonths: 24, endDate: null,
        evidence: "Illustrative sample text: Cordless vacuum, 2-year manufacturer warranty.", source: "extraction",
      }],
    }],
    notableItems: [{ name: "Cordless vacuum", price: 229, category: "Home", reason: "Illustrative sample highlight. Not a store policy." }],
    summary: "A cordless vacuum cleaner. Fictional sample purchase.",
    warranty: "Illustrative sample. The vacuum line states a 2-year manufacturer warranty. This receipt text is not a store policy.",
  },
  {
    ...base, ...at("2026-10-19"), id: 903, merchant: "Mercado Verde", category: "Groceries",
    purchaseDate: "2026-10-19", total: 38.47,
    products: [
      { lineId: "l_sampleverde001", name: "Olive oil", price: 9.99, quantity: 1 },
      { lineId: "l_sampleverde002", name: "Coffee beans", price: 8.49, quantity: 1 },
      { lineId: "l_sampleverde003", name: "Fresh fruit", price: 6.79, quantity: 1 },
      { lineId: "l_sampleverde004", name: "Cheese", price: 5.5, quantity: 1 },
      { lineId: "l_sampleverde005", name: "Yoghurt pack", price: 4.5, quantity: 1 },
      { lineId: "l_sampleverde006", name: "Sourdough loaf", price: 3.2, quantity: 1 },
    ],
    notableItems: [], summary: "Weekly groceries. Fictional sample purchase.", warranty: null,
  },
  {
    ...base, ...at("2026-10-04"), id: 904, merchant: "Atelier Norte", category: "Clothing & Apparel",
    purchaseDate: "2026-10-04", total: 59.9,
    products: [
      { lineId: "l_samplenorte001", name: "Cotton shirt", price: 35, quantity: 1 },
      { lineId: "l_samplenorte002", name: "Wool scarf", price: 24.9, quantity: 1 },
    ],
    notableItems: [], summary: "A cotton shirt and a wool scarf. Fictional sample purchase.", warranty: null,
  },
].map((receipt, index) => ({ ...receipt, itemRights: sampleItemRights[index] }));

const usWithRights = usReceipts.map((receipt, index) => ({ ...receipt, itemRights: usItemRights[index] }));

export const euCapture = {
  name: "eu", market: "PT", country: "PT", capturedAt: euCapturedAt,
  locale: "en-GB", timezoneId: "Europe/Lisbon", searchQuery: "TV",
  phone: { width: 390, height: 844, deviceScaleFactor: 2 },
  receipts: euReceipts,
};
export const usCapture = {
  name: "us", market: "US", country: "US", capturedAt: usCapturedAt,
  locale: "en-US", timezoneId: "UTC", searchQuery: usSearchQuery,
  phone: { width: 390, height: 844, deviceScaleFactor: 3 },
  receipts: usWithRights,
};

export function activeCapture() {
  return process.env.CAPTURE_CONTEXT === "us" ? usCapture : euCapture;
}

export const capturedAt = activeCapture().capturedAt;
export const receipts = activeCapture().receipts;

// One allowlist for Playwright and for the loopback preview server.
export function createCaptureSession() {
  const capture = activeCapture();
  const sample = capture.receipts;
  const hero = sample[0];
  const totalSpent = Math.round(sample.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  let created = false;
  return {
    capture,
    answer(method, rawUrl) {
      const url = new URL(rawUrl);
      if (url.origin !== "http://127.0.0.1:5199") {
        if (method === "GET" && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) return { continue: true };
        return { abort: true, unexpected: `${method} external request` };
      }
      const p = url.pathname;
      if (!p.startsWith("/api/")) return { continue: true };
      const json = data => ({ fulfill: { json: data } });
      if (p === `/api/storage${hero.objectPath}` && method === "GET") {
        return { fulfill: { contentType: hero.contentType, sample: true } };
      }
      if (p === "/api/storage/uploads/request-url" && method === "POST") {
        return json({ uploadURL: `${url.origin}/api/capture-upload`, objectPath: hero.objectPath });
      }
      if (p === "/api/capture-upload" && method === "PUT") return { fulfill: { status: 200, body: "" } };
      if (p === "/api/receipts" && method === "POST") {
        created = true;
        return json(hero);
      }
      if (p === `/api/receipts/${hero.id}` && method === "PATCH" && created) return { fulfill: { json: null }, patch: true };
      if (p === "/api/account/market" && method === "GET") return json({ market: capture.market, country: capture.country });
      if (method !== "GET") return { fulfill: { status: 403, json: { error: "Disabled during marketing capture" } }, unexpected: `${method} ${p}` };
      if (p === "/api/receipts/check-similar") return json([]);
      if (p === "/api/receipts/stats") return json({ totalReceipts: sample.length, totalSpent, categories: [] });
      if (p === "/api/receipts/recent") return json(sample);
      if (/^\/api\/receipts\/\d+$/.test(p)) return json(sample.find(r => r.id === Number(p.split("/").pop())) ?? null);
      if (p === "/api/receipts") {
        const q = (url.searchParams.get("q") || "").toLowerCase();
        const items = sample.filter(r => JSON.stringify([r.merchant, r.products, r.category]).toLowerCase().includes(q));
        return json({ items, nextCursor: null, hasMore: false });
      }
      if (p === "/api/mail/pending") return json([]);
      if (p === "/api/mail/status") return json({ enabledProviders: ["outlook"], providers: [], needsReconnect: false, pendingCount: 0 });
      if (p === "/api/billing/subscription") return json({ plan: "pro", ownerAccess: false, cancelAtPeriodEnd: false });
      if (p === "/api/notifications/preferences") return json({ optOut: true });
      if (p === "/api/push/vapid-public-key") return json({ publicKey: null });
      if (p === "/api/push/subscriptions") return json([]);
      return { fulfill: { status: 403, json: { error: "Unmapped capture endpoint" } }, unexpected: `${method} ${p}` };
    },
    patched(body) { return { ...hero, ...body }; },
  };
}

// Deterministic response interception, fail closed. No backend is contacted.
export async function isolate(context, sampleFile) {
  const session = createCaptureSession();
  const unexpected = [];
  await context.addInitScript(({ capturedAt: frozen }) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [frozen])); }
      static now() { return new RealDate(frozen).getTime(); }
    }
    window.Date = FixedDate;
    localStorage.setItem("receebo:onboarding:dismissed", "true");
    localStorage.setItem("receebo:onboarding:searchDone", "true");
  }, { capturedAt: session.capture.capturedAt });
  await context.route("**/*", async route => {
    const req = route.request();
    const action = session.answer(req.method(), req.url());
    if (action.unexpected) unexpected.push(action.unexpected);
    if (action.continue) return route.continue();
    if (action.abort) return route.abort();
    if (action.patch) return route.fulfill({ json: session.patched(req.postDataJSON()) });
    if (action.fulfill?.sample) return route.fulfill({ path: sampleFile, contentType: action.fulfill.contentType });
    return route.fulfill(action.fulfill);
  });
  return unexpected;
}
