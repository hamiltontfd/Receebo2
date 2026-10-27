export const capturedAt = "2026-10-27T12:00:00Z";
// Same fictional story as the dev demo account, the promo video and the Taikai banner.
const base = {
  status: "completed", currency: "EUR", purchaseCountry: "PT",
  isOnlinePurchase: false, deliveryDate: null, isDraft: false, contentType: "image/png",
  objectPath: "/objects/sample-receipt.png", originalFileName: "casa-lumen-sample.png",
  attachments: [], transactionNumber: null, ocrText: "FICTIONAL SAMPLE RECEIPT",
};
const at = date => ({ createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z` });
export const receipts = [
  {
    ...base, ...at("2026-10-23"), id: 901, merchant: "Casa Lumen Electrónica", category: "Electronics",
    purchaseDate: "2026-10-23", total: 649,
    products: [{ name: "55\" 4K Smart TV", price: 649, quantity: 1 }],
    notableItems: [{ name: "55\" 4K Smart TV", price: 649, reason: "High-value electronics with legal and manufacturer warranty." }],
    summary: "In-store purchase at Casa Lumen Electrónica of a 55\" 4K Smart TV. Fictional sample purchase in Portugal.",
    warranty: "2-year manufacturer warranty",
  },
  {
    ...base, ...at("2026-10-12"), id: 902, merchant: "Casa & Jardim Braga", category: "Home",
    purchaseDate: "2026-10-12", total: 229,
    products: [{ name: "Cordless vacuum", price: 229, quantity: 1 }],
    notableItems: [{ name: "Cordless vacuum", price: 229, reason: "Keep proof of purchase for warranty support." }],
    summary: "A cordless vacuum cleaner. Fictional sample purchase.",
    warranty: "2-year manufacturer warranty",
  },
  {
    ...base, ...at("2026-10-19"), id: 903, merchant: "Mercado Verde", category: "Groceries",
    purchaseDate: "2026-10-19", total: 38.47,
    products: [
      { name: "Olive oil", price: 9.99, quantity: 1 }, { name: "Coffee beans", price: 8.49, quantity: 1 },
      { name: "Fresh fruit", price: 6.79, quantity: 1 }, { name: "Cheese", price: 5.5, quantity: 1 },
      { name: "Yoghurt pack", price: 4.5, quantity: 1 }, { name: "Sourdough loaf", price: 3.2, quantity: 1 },
    ],
    notableItems: [], summary: "Weekly groceries. Fictional sample purchase.", warranty: null,
  },
  {
    ...base, ...at("2026-10-04"), id: 904, merchant: "Atelier Norte", category: "Clothing & Apparel",
    purchaseDate: "2026-10-04", total: 59.9,
    products: [{ name: "Cotton shirt", price: 35, quantity: 1 }, { name: "Wool scarf", price: 24.9, quantity: 1 }],
    notableItems: [], summary: "A cotton shirt and a wool scarf. Fictional sample purchase.", warranty: null,
  },
];
const totalSpent = Math.round(receipts.reduce((sum, r) => sum + r.total, 0) * 100) / 100;

// Deterministic response interception, fail closed. No backend is contacted.
export async function isolate(context, receiptImage) {
  const unexpected = [];
  let created = false;
  await context.addInitScript(({ capturedAt }) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [capturedAt])); }
      static now() { return new RealDate(capturedAt).getTime(); }
    }
    window.Date = FixedDate;
    localStorage.setItem("receebo:onboarding:dismissed", "true");
    localStorage.setItem("receebo:onboarding:searchDone", "true");
  }, { capturedAt });
  await context.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== "http://127.0.0.1:5199") {
      // Fonts are the only external read permitted. All other external traffic
      // (including auth, billing, mail, analytics) is blocked.
      if (req.method() === "GET" && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) return route.continue();
      unexpected.push(`${req.method()} external request`);
      return route.abort();
    }
    const p = url.pathname;
    if (!p.startsWith("/api/")) return route.continue();
    const json = data => route.fulfill({ json: data });
    if (p === "/api/storage/objects/sample-receipt.png") return route.fulfill({ path: receiptImage, contentType: "image/png" });
    if (p === "/api/storage/uploads/request-url" && req.method() === "POST") {
      return json({ uploadURL: `${url.origin}/api/capture-upload`, objectPath: base.objectPath });
    }
    if (p === "/api/capture-upload" && req.method() === "PUT") return route.fulfill({ status: 200, body: "" });
    if (p === "/api/receipts" && req.method() === "POST") {
      created = true;
      return json(receipts[0]);
    }
    if (p === `/api/receipts/${receipts[0].id}` && req.method() === "PATCH" && created) return json({ ...receipts[0], ...req.postDataJSON() });
    if (req.method() !== "GET") {
      unexpected.push(`${req.method()} ${p}`);
      return route.fulfill({ status: 403, json: { error: "Disabled during marketing capture" } });
    }
    if (p === "/api/receipts/check-similar") return json([]);
    if (p === "/api/receipts/stats") return json({ totalReceipts: receipts.length, totalSpent, categories: [] });
    if (p === "/api/receipts/recent") return json(receipts);
    if (/^\/api\/receipts\/\d+$/.test(p)) return json(receipts.find(r => r.id === Number(p.split("/").pop())));
    if (p === "/api/receipts") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const items = receipts.filter(r => JSON.stringify([r.merchant, r.products, r.category]).toLowerCase().includes(q));
      return json({ items, nextCursor: null, hasMore: false });
    }
    // No inbox is connected in the sample collection.
    if (p === "/api/mail/pending") return json([]);
    if (p === "/api/mail/status") return json({ enabledProviders: ["outlook"], providers: [], needsReconnect: false, pendingCount: 0 });
    if (p === "/api/billing/subscription") return json({ plan: "pro", ownerAccess: false, cancelAtPeriodEnd: false });
    if (p === "/api/notifications/preferences") return json({ optOut: true });
    if (p === "/api/push/vapid-public-key") return json({ publicKey: null });
    if (p === "/api/push/subscriptions") return json([]);
    unexpected.push(`${req.method()} ${p}`);
    return route.fulfill({ status: 403, json: { error: "Unmapped capture endpoint" } });
  });
  return unexpected;
}
