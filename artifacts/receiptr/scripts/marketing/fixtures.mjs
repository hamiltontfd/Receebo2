export const capturedAt = "2026-10-25T12:00:00Z";
const base = {
  status: "completed", currency: "EUR", purchaseCountry: "PT",
  isOnlinePurchase: true, isDraft: false, contentType: "image/png",
  objectPath: "/objects/sample-receipt.png", originalFileName: "northline-sample.png",
  createdAt: "2026-10-20T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z",
  attachments: [], transactionNumber: null, ocrText: "FICTIONAL SAMPLE RECEIPT",
};
export const receipts = [
  {
    ...base, id: 901, merchant: "Northline Audio", category: "Electronics",
    purchaseDate: "2026-10-20", total: 189,
    products: [{ name: "Studio wireless headphones", price: 169, quantity: 1 }, { name: "Travel case", price: 20, quantity: 1 }],
    notableItems: [{ name: "Studio wireless headphones", price: 169, reason: "Keep proof of purchase for warranty support." }],
    summary: "Studio wireless headphones and a protective travel case. Fictional online purchase in Portugal.",
    warranty: "Sample receipt: 2-year manufacturer warranty on headphones. Terms and exclusions apply; check with the seller.",
  },
  {
    ...base, id: 902, merchant: "Field & Form", category: "Home",
    purchaseDate: "2026-10-17", total: 74,
    products: [{ name: "Task lamp", price: 59, quantity: 1 }, { name: "LED bulb set", price: 15, quantity: 1 }],
    notableItems: [{ name: "Task lamp", price: 59, reason: "Keep your receipt." }],
    summary: "A task lamp and LED bulbs for a home workspace. Fictional sample purchase.",
    warranty: "Sample receipt: 2-year manufacturer warranty on lamp; bulbs excluded.",
  },
  {
    ...base, id: 903, merchant: "Everyday Market", category: "Groceries",
    purchaseDate: "2026-10-15", total: 23.5, isOnlinePurchase: false,
    products: [{ name: "Olive oil", price: 12, quantity: 1 }, { name: "Coffee beans", price: 8, quantity: 1 }, { name: "Sourdough loaf", price: 3.5, quantity: 1 }],
    notableItems: [], summary: "Pantry essentials. Fictional sample purchase.", warranty: null,
  },
];

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
    if (p === "/api/receipts/901" && req.method() === "PATCH" && created) return json({ ...receipts[0], ...req.postDataJSON() });
    if (req.method() !== "GET") {
      unexpected.push(`${req.method()} ${p}`);
      return route.fulfill({ status: 403, json: { error: "Disabled during marketing capture" } });
    }
    if (p === "/api/receipts/check-similar") return json([]);
    if (p === "/api/receipts/stats") return json({ totalReceipts: 3, totalSpent: 286.5, categories: [] });
    if (p === "/api/receipts/recent") return json(receipts);
    if (/^\/api\/receipts\/\d+$/.test(p)) return json(receipts.find(r => r.id === Number(p.split("/").pop())));
    if (p === "/api/receipts") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const items = receipts.filter(r => JSON.stringify([r.merchant, r.products, r.category]).toLowerCase().includes(q));
      return json({ items, nextCursor: null, hasMore: false });
    }
    if (p === "/api/gmail/pending") return json([]);
    if (p === "/api/gmail/status") return json({ configured: true, connected: false, gmailEmail: null, lastSyncedAt: null, pendingCount: 0 });
    if (p === "/api/billing/subscription") return json({ plan: "pro", ownerAccess: false, cancelAtPeriodEnd: false });
    if (p === "/api/notifications/preferences") return json({ optOut: true });
    if (p === "/api/push/vapid-public-key") return json({ publicKey: null });
    if (p === "/api/push/subscriptions") return json([]);
    unexpected.push(`${req.method()} ${p}`);
    return route.fulfill({ status: 403, json: { error: "Unmapped capture endpoint" } });
  });
  return unexpected;
}
