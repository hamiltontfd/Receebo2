import sampleItemRights from "./sample-item-rights.json" with { type: "json" };
import usItemRights from "./us-item-rights.json" with { type: "json" };
import { usCapturedAt, usReceipts, usSearchQuery } from "./us-collection.mjs";
import brItemRights from "./br-item-rights.json" with { type: "json" };
import { brCapturedAt, brReceipts } from "./br-collection.mjs";

export const euCapturedAt = "2026-10-27T12:00:00Z";
// Illustrative capture collection only. itemRights is the saved output of
// evaluateItemRights for region PT on 2026-10-27, locked by marketingFixture.test.ts.
// It is not a store policy and it is not written to any account.
const base = {
  status: "completed", currency: "EUR", purchaseCountry: "PT",
  isOnlinePurchase: false, deliveryDate: null, isDraft: false, contentType: "image/png",
  objectPath: "/objects/sample-receipt.png", originalFileName: "casa-lumen-sample.png",
  attachments: [], transactionNumber: null, ocrText: "RECIBO FICTÍCIO DE EXEMPLO",
};
const at = date => ({ createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z` });
const euReceipts = [
  {
    ...base, ...at("2026-10-23"), id: 901, merchant: "Casa Lumen Electrónica", category: "Electronics",
    purchaseDate: "2026-10-23", deliveryDate: "2026-10-25", isOnlinePurchase: true, total: 649,
    products: [
      {
        lineId: "l_samplecasa0001", name: "Smart TV 4K de 55 polegadas", price: 480, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [{
          id: "c_samplecasa0001", kind: "warranty", warrantyType: "manufacturer", basis: "stated",
          certainty: "estimated", lengthDays: null, lengthMonths: 24, endDate: null,
          evidence: "Texto fictício de exemplo: Smart TV 4K de 55 polegadas, garantia do fabricante de 2 anos.", source: "extraction",
        }],
      },
      {
        lineId: "l_samplecasa0002", name: "Soundbar de exemplo", price: 149, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [{
          id: "c_samplecasa0002", kind: "warranty", warrantyType: "manufacturer", basis: "stated",
          certainty: "estimated", lengthDays: null, lengthMonths: 12, endDate: null,
          evidence: "Texto fictício de exemplo: soundbar de exemplo, garantia do fabricante de 12 meses.", source: "extraction",
        }],
      },
      { lineId: "l_samplecasa0003", name: "Cabo HDMI", price: 12, quantity: 1 },
      { lineId: "l_samplecasa0004", name: "Parafusos de parede", price: 5, quantity: 1 },
      { lineId: "l_samplecasa0005", name: "Pano de limpeza", price: 3, quantity: 1 },
    ],
    notableItems: [
      { name: "Smart TV 4K de 55 polegadas", price: 480, category: "Electronics", reason: "Destaque fictício de exemplo." },
      { name: "Soundbar de exemplo", price: 149, category: "Electronics", reason: "Destaque fictício de exemplo." },
    ],
    summary: "Compra online fictícia na Casa Lumen Electrónica, entregue em Portugal. Dados de exemplo: televisão, soundbar e pequenos acessórios.",
    warranty: "Exemplo fictício. A linha do televisor indica uma garantia do fabricante de 2 anos. Este texto do recibo não é aplicado aos outros artigos.",
  },
  {
    ...base, ...at("2026-10-12"), id: 902, merchant: "Casa & Jardim Braga", category: "Home",
    purchaseDate: "2026-10-12", total: 229,
    products: [{
      lineId: "l_samplejardim01", name: "Aspirador sem fios", price: 229, quantity: 1,
      category: "Home", categorySource: "extraction",
      coverages: [{
        id: "c_samplejardim01", kind: "warranty", warrantyType: "manufacturer", basis: "stated",
        certainty: "estimated", lengthDays: null, lengthMonths: 24, endDate: null,
        evidence: "Texto fictício de exemplo: aspirador sem fios, garantia do fabricante de 2 anos.", source: "extraction",
      }],
    }],
    notableItems: [{ name: "Aspirador sem fios", price: 229, category: "Home", reason: "Destaque fictício de exemplo." }],
    summary: "Aspirador sem fios. Compra fictícia de exemplo.",
    warranty: "Exemplo fictício. A linha do aspirador indica uma garantia do fabricante de 2 anos. Este texto do recibo não é uma política da loja.",
  },
  {
    ...base, ...at("2026-10-19"), id: 903, merchant: "Mercado Verde", category: "Groceries",
    purchaseDate: "2026-10-19", total: 38.47,
    products: [
      { lineId: "l_sampleverde001", name: "Azeite", price: 9.99, quantity: 1 },
      { lineId: "l_sampleverde002", name: "Café em grão", price: 8.49, quantity: 1 },
      { lineId: "l_sampleverde003", name: "Fruta fresca", price: 6.79, quantity: 1 },
      { lineId: "l_sampleverde004", name: "Queijo", price: 5.5, quantity: 1 },
      { lineId: "l_sampleverde005", name: "Iogurtes", price: 4.5, quantity: 1 },
      { lineId: "l_sampleverde006", name: "Pão de massa-mãe", price: 3.2, quantity: 1 },
    ],
    notableItems: [], summary: "Compras semanais de supermercado. Compra fictícia de exemplo.", warranty: null,
  },
  {
    ...base, ...at("2026-10-04"), id: 904, merchant: "Atelier Norte", category: "Clothing & Apparel",
    purchaseDate: "2026-10-04", total: 59.9,
    products: [
      { lineId: "l_samplenorte001", name: "Camisa de algodão", price: 35, quantity: 1 },
      { lineId: "l_samplenorte002", name: "Cachecol de lã", price: 24.9, quantity: 1 },
    ],
    notableItems: [], summary: "Camisa de algodão e cachecol de lã. Compra fictícia de exemplo.", warranty: null,
  },
].map((receipt, index) => ({ ...receipt, itemRights: sampleItemRights[index] }));

const usWithRights = usReceipts.map((receipt, index) => ({ ...receipt, itemRights: usItemRights[index] }));

export const euCapture = {
  name: "eu", market: "PT", country: "PT", capturedAt: euCapturedAt,
  language: "pt-PT", locale: "pt-PT", timezoneId: "Europe/Lisbon", searchQuery: "TV",
  output: "generated-artifacts/receebo-marketing",
  phone: { width: 390, height: 844, deviceScaleFactor: 2 },
  receipts: euReceipts,
};
export const usCapture = {
  name: "us", market: "US", country: "US", capturedAt: usCapturedAt,
  language: "en", locale: "en-US", timezoneId: "UTC", searchQuery: usSearchQuery,
  output: "generated-artifacts/receebo-marketing-us",
  phone: { width: 390, height: 844, deviceScaleFactor: 2 },
  receipts: usWithRights,
};
export const brCapture = {
  name: "br", market: "BR", country: "BR", capturedAt: brCapturedAt,
  language: "pt-BR", locale: "pt-BR", timezoneId: "America/Sao_Paulo", searchQuery: "TV",
  output: "generated-artifacts/receebo-marketing-br",
  phone: { width: 390, height: 844, deviceScaleFactor: 2 },
  receipts: brReceipts.map((receipt, index) => ({ ...receipt, itemRights: brItemRights[index] })),
};

export function activeCapture(value = process.env.CAPTURE_CONTEXT ?? "eu") {
  const capture = { eu: euCapture, pt: euCapture, us: usCapture, br: brCapture }[value];
  if (!capture) throw new Error(`Unknown CAPTURE_CONTEXT: choose eu, pt, us or br`);
  return capture;
}

export const capturedAt = activeCapture().capturedAt;
export const receipts = activeCapture().receipts;

// One allowlist for Playwright and for the loopback preview server.
export function createCaptureSession(capture = activeCapture()) {
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
      if (p === "/api/account/language" && method === "GET") return json({ language: capture.language });
      if (p === "/api/account/detected-language" && (method === "PUT" || method === "POST")) {
        return { fulfill: { status: 200, json: {} } };
      }
      if (p === "/api/account/onboarding" && (method === "GET" || method === "PATCH")) {
        return json({ receiptDone: true, searchDone: true, completed: true, dismissed: true });
      }
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
