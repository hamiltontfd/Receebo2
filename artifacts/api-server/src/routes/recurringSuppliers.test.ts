import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  db, accountTrialsTable, trialUploadsTable, receiptsTable, pendingImportsTable,
  userBillingTable, trialFunnelSubjectsTable,
} from "@workspace/db";

const fixture = vi.hoisted(() => ({ deleted: [] as string[], failDelete: new Set<string>(), download: vi.fn() }));
// Auth is replaced for the local HTTP harness; entitlements, transactions,
// advisory locks and trial accounting are real (local PostgreSQL).
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.userId = req.headers["x-test-user"];
    return req.userId ? next() : res.sendStatus(401);
  },
}));
vi.mock("../middlewares/guestAuth", () => ({
  requireAuthOrGuest: (req: any, res: any, next: any) => {
    req.userId = req.headers["x-test-user"];
    return req.userId ? next() : res.sendStatus(401);
  },
}));
vi.mock("../lib/legalAcceptance", () => ({
  requireCurrentLegalAcceptance: (_req: any, _res: any, next: any) => next(),
}));
// Users named owner-* get unlimited (owner) access; everyone else is a normal account.
vi.mock("../lib/ownerAccess", () => ({ hasOwnerAccess: async (id: string) => id.startsWith("owner-") }));
vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [] }) } },
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    deleteObject = async (path: string) => {
      if (fixture.failDelete.has(path)) throw new Error("storage down");
      fixture.deleted.push(path);
    };
    getObjectEntityFile = async () => ({});
    downloadObject = fixture.download;
  },
  objectStorageClient: {},
}));

import gmail from "./gmail";
import recurring from "./recurringSuppliers";
import { recurringSuppliersTable } from "@workspace/db";
import storage from "./storage";
import billing from "./billing";
import { requireProductAccess } from "../middlewares/productAccess";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { withUserDataLock } from "../lib/userDataLock";
import { TRIAL_LIMIT } from "../lib/accountTrial";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";

let server: Server;
let base: string;
const users: string[] = [];

const extraction = (over: Record<string, unknown> = {}) => ({
  merchant: "Fixture store", purchaseDate: "2026-10-20", total: 12.5, currency: "EUR",
  category: "Other", summary: "Fixture", ocrText: "SECRET RAW OCR TEXT", warranty: null,
  transactionNumber: null, products: [{ name: "Thing", quantity: 1, price: 12.5 }],
  notableItems: [], purchaseCountry: "PT", isOnlinePurchase: true, ...over,
});

beforeAll(async () => {
  const app = express();
  app.use(express.json(), (req, _res, next) => {
    req.log = { error() {}, warn() {}, info() {} } as any;
    next();
  });
  app.use(["/mail/pending", "/mail/recurring-suppliers", "/storage/objects"], requireAuthOrGuest, requireProductAccess);
  app.use("/api", storage);
  app.use(gmail, recurring, billing);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  for (const id of users) {
    await db.delete(trialUploadsTable).where(eq(trialUploadsTable.userId, id));
    await db.delete(pendingImportsTable).where(eq(pendingImportsTable.userId, id));
    await db.delete(recurringSuppliersTable).where(eq(recurringSuppliersTable.userId, id));
    await db.delete(receiptsTable).where(eq(receiptsTable.userId, id));
    await db.delete(userBillingTable).where(eq(userBillingTable.userId, id));
    await db.delete(accountTrialsTable).where(eq(accountTrialsTable.userId, id));
    await db.delete(trialFunnelSubjectsTable).where(eq(trialFunnelSubjectsTable.userId, id));
    await db.execute(sql`DELETE FROM trial_ai_reads WHERE user_id = ${id}`);
  }
});
beforeEach(() => {
  fixture.deleted = [];
  fixture.failDelete = new Set();
  fixture.download.mockReset().mockImplementation(async () => new Response("pdf bytes", {
    headers: { "content-type": "application/pdf" },
  }));
});

function newUser(prefix: "owner" | "trial") {
  const id = `${prefix}-recurring-fixture-${randomUUID()}`;
  users.push(id);
  return id;
}
function call(user: string, path: string, body?: object, method = body ? "POST" : "GET") {
  return fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-test-user": user, "x-test-consent": "accepted" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function seed(user: string, data: Array<Record<string, unknown>>, status = "pending") {
  return db.insert(pendingImportsTable).values(data.map((d, i) => ({
    userId: user, provider: "outlook", gmailMessageId: randomUUID(), status,
    objectPath: `/objects/uploads/mail-${randomUUID()}`, originalFileName: `mail-${i}.pdf`,
    extractionData: extraction(d) as any,
  }))).returning();
}
async function startTrial(user: string) {
  expect((await call(user, "/billing/start-trial", {})).status).toBe(200);
}

const netflix = (over: Record<string, unknown> = {}) => ({
  merchant: "Netflix", total: 13.99, category: "Entertainment", purchaseType: "subscription",
  senderDomain: "netflix.com", products: [{ name: "Standard plan", quantity: 1, price: 13.99 }], ...over,
});

async function supplierRow(user: string, key: string) {
  const [row] = await db.select().from(recurringSuppliersTable)
    .where(and(eq(recurringSuppliersTable.userId, user), eq(recurringSuppliersTable.supplierKey, key)));
  return row;
}

describe("pending list: recurring info", () => {
  it("marks items from an undecided recurring supplier with its key, name, kind and pending count", async () => {
    const user = newUser("owner");
    const [a] = await seed(user, [
      netflix({ merchant: "Netflix International B.V.", purchaseDate: "2026-10-01" }),
      netflix({ purchaseDate: "2026-09-01" }),
      { merchant: "EDP Comercial – Comercialização de Energia, S.A.", total: 61.2, category: "Home", senderDomain: "edp.pt" },
      { merchant: "Worten", total: 99, category: "Electronics" },
    ]);
    const body = await (await call(user, "/mail/pending?meta=1")).json();
    const by = Object.fromEntries(body.items.map((i: any) => [i.merchant, i.recurring]));
    expect(by["Netflix International B.V."]).toEqual({
      supplierKey: "netflix", displayName: "Netflix", kind: "subscription", category: "Entertainment", status: "undecided", pendingCount: 2,
    });
    expect(by["EDP Comercial – Comercialização de Energia, S.A."]).toMatchObject({ supplierKey: "edp", displayName: "EDP Comercial", kind: "utility" });
    expect(by["Worten"]).toBeNull();
    const detail = await (await call(user, `/mail/pending/${a.id}`)).json();
    expect(detail.recurring).toMatchObject({ supplierKey: "netflix", status: "undecided" });
  });

  it("Apple: an older pending subscription (no stored type) offers Always import; a one-off App Store purchase keeps Accept", async () => {
    const user = newUser("owner");
    const [sub, app] = await seed(user, [
      { merchant: "Apple", total: 30.95, category: "Entertainment", senderDomain: "email.apple.com",
        products: [{ name: "Apple One Premium Subscription", quantity: 1, price: 30.95 }] },
      { merchant: "Apple", total: 4.99, category: "Entertainment", senderDomain: "email.apple.com", purchaseType: "digital",
        products: [{ name: "Some Game", quantity: 1, price: 4.99 }] },
    ]);
    const body = await (await call(user, "/mail/pending?meta=1")).json();
    const byId = Object.fromEntries(body.items.map((i: any) => [i.id, i]));
    expect(byId[sub!.id].purchaseType).toBe("subscription");
    expect(byId[sub!.id].recurring).toMatchObject({ supplierKey: "apple", kind: "subscription", status: "undecided", pendingCount: 1 });
    expect(byId[app!.id].recurring).toBeNull();
    const detail = await (await call(user, `/mail/pending/${sub!.id}`)).json();
    expect(detail.recurring).toMatchObject({ supplierKey: "apple", status: "undecided" });
    // Always import accepts the subscription only.
    expect((await call(user, "/mail/recurring-suppliers/apple/always-import", { id: sub!.id })).status).toBe(200);
    const left = await (await call(user, "/mail/pending?meta=1")).json();
    expect(left.items.map((i: any) => i.id)).toEqual([app!.id]);
  });
});

describe("POST /mail/recurring-suppliers/:key/always-import", () => {
  it("turns the supplier on and accepts this one plus all its pending receipts in one call", async () => {
    const user = newUser("owner");
    const [first, second, third, other] = await seed(user, [
      netflix({ purchaseDate: "2026-10-01" }), netflix({ purchaseDate: "2026-09-01" }),
      netflix({ merchant: "Netflix International B.V.", purchaseDate: "2026-08-01" }),
      { merchant: "Worten" },
    ]);
    const res = await call(user, "/mail/recurring-suppliers/netflix/always-import", { id: second.id, category: "Home" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.supplier).toMatchObject({ supplierKey: "netflix", displayName: "Netflix", status: "on", category: "Home" });
    expect(body.supplier).not.toHaveProperty("pendingIds");
    expect(body.approved.map((a: any) => a.id)).toEqual([second.id, first.id, third.id]);
    expect(body.skipped).toEqual([]);
    const receipts = await db.select().from(receiptsTable).where(eq(receiptsTable.userId, user));
    expect(receipts).toHaveLength(3);
    const cat = Object.fromEntries(body.approved.map((a: any) => [a.id, receipts.find((r) => r.id === a.receiptId)!.category]));
    // The sheet's pick goes to this receipt and becomes the supplier default.
    expect(cat[second.id]).toBe("Home");
    expect(cat[first.id]).toBe("Home");
    const row = await supplierRow(user, "netflix");
    expect(row).toMatchObject({ status: "on", category: "Home", kind: "subscription" });
    expect(row!.senderDomains).toContain("netflix.com");
    const left = await db.select().from(pendingImportsTable).where(and(eq(pendingImportsTable.userId, user), eq(pendingImportsTable.status, "pending")));
    expect(left.map((p) => p.id)).toEqual([other.id]);
  });

  it("without a pick each receipt keeps its suggested category", async () => {
    const user = newUser("owner");
    await seed(user, [netflix({ category: "Entertainment" }), netflix({ category: "Other", purchaseDate: "2026-09-01" })]);
    const body = await (await call(user, "/mail/recurring-suppliers/netflix/always-import", {})).json();
    expect(body.approved).toHaveLength(2);
    const cats = (await db.select().from(receiptsTable).where(eq(receiptsTable.userId, user))).map((r) => r.category).sort();
    expect(cats).toEqual(["Entertainment", "Other"]);
    expect((await supplierRow(user, "netflix"))!.category).toBeNull();
  });

  it("no-card trial: accepts up to the remaining slots, the rest stays pending", async () => {
    const user = newUser("trial");
    await startTrial(user);
    const rows = await seed(user, Array.from({ length: TRIAL_LIMIT + 2 }, (_, i) =>
      netflix({ purchaseDate: `2026-${String(1 + i).padStart(2, "0")}-05` })));
    const res = await call(user, "/mail/recurring-suppliers/netflix/always-import", { id: rows[0].id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approved).toHaveLength(TRIAL_LIMIT);
    expect(body.approved[0].id).toBe(rows[0].id);
    expect(body.skipped).toHaveLength(2);
    expect(body.code).toBe("TRIAL_UPLOAD_LIMIT");
    expect((await supplierRow(user, "netflix"))!.status).toBe("on");
  });

  it("409 SYNC_IN_PROGRESS changes nothing", async () => {
    const user = newUser("owner");
    const [row] = await seed(user, [netflix()]);
    let release!: () => void;
    let held!: () => void;
    const isHeld = new Promise<void>((r) => { held = r; });
    const holder = withUserDataLock(user, () => new Promise<void>((r) => { release = r; held(); }));
    await isHeld;
    let res: Response;
    try {
      res = await call(user, "/mail/recurring-suppliers/netflix/always-import", { id: row.id });
    } finally {
      release();
      await holder;
    }
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SYNC_IN_PROGRESS");
    expect(await supplierRow(user, "netflix")).toBeUndefined();
    const [still] = await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.id, row.id));
    expect(still.status).toBe("pending");
  }, 15_000);

  it("404 for an unknown supplier or an id from another supplier; 400 for a bad category", async () => {
    const user = newUser("owner");
    const [, worten] = await seed(user, [netflix(), { merchant: "Worten" }]);
    expect((await call(user, "/mail/recurring-suppliers/worten/always-import", {})).status).toBe(404);
    expect((await call(user, "/mail/recurring-suppliers/netflix/always-import", { id: worten.id })).status).toBe(404);
    expect((await call(user, "/mail/recurring-suppliers/netflix/always-import", { category: "Nope" })).status).toBe(400);
  });

  it("dismiss leaves the supplier undecided", async () => {
    const user = newUser("owner");
    const [a] = await seed(user, [netflix(), netflix({ purchaseDate: "2026-09-01" })]);
    expect((await call(user, `/mail/pending/${a.id}`, undefined, "DELETE")).status).toBe(200);
    expect(await supplierRow(user, "netflix")).toBeUndefined();
    const body = await (await call(user, "/mail/pending?meta=1")).json();
    expect(body.items[0].recurring).toMatchObject({ status: "undecided", pendingCount: 1 });
  });
});

describe("GET / PUT /mail/recurring-suppliers", () => {
  it("lists detected suppliers (on first, then most recent) and switches them off and on, future only", async () => {
    const user = newUser("owner");
    await db.insert(receiptsTable).values([
      { userId: user, merchant: "Netflix", total: 13.99, currency: "EUR", purchaseDate: "2026-10-21", category: "Entertainment", status: "completed", purchaseType: "subscription", objectPath: "/objects/r1", originalFileName: "r1.pdf", contentType: "application/pdf" },
      { userId: user, merchant: "EDP Comercial", total: 61.2, currency: "EUR", purchaseDate: "2026-10-25", category: "Home", status: "completed", objectPath: "/objects/r2", originalFileName: "r2.pdf", contentType: "application/pdf" },
      { userId: user, merchant: "Worten", total: 99, currency: "EUR", purchaseDate: "2026-10-26", category: "Electronics", status: "completed", objectPath: "/objects/r3", originalFileName: "r3.pdf", contentType: "application/pdf" },
    ] as any);
    const [pend] = await seed(user, [{ merchant: "EDP Comercial", senderDomain: "edp.pt", total: 60, category: "Home" }]);

    let list = (await (await call(user, "/mail/recurring-suppliers")).json()).suppliers;
    expect(list.map((s: any) => s.supplierKey)).toEqual(["edp", "netflix"]);
    expect(list[1]).toEqual({
      supplierKey: "netflix", displayName: "Netflix", kind: "subscription", category: "Entertainment", status: "undecided",
      receiptCount: 1, lastReceiptDate: "2026-10-21", lastAmount: 13.99, lastCurrency: "EUR", pendingCount: 0,
    });

    const on = await call(user, "/mail/recurring-suppliers/netflix", { status: "on" }, "PUT");
    expect(on.status).toBe(200);
    expect((await on.json()).supplier.status).toBe("on");
    list = (await (await call(user, "/mail/recurring-suppliers")).json()).suppliers;
    expect(list.map((s: any) => [s.supplierKey, s.status])).toEqual([["netflix", "on"], ["edp", "undecided"]]);

    const off = await call(user, "/mail/recurring-suppliers/edp", { status: "off" }, "PUT");
    expect((await off.json()).supplier).toMatchObject({ supplierKey: "edp", status: "off" });
    // Pending stays pending (handled by hand, no recurring card).
    const [still] = await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.id, pend.id));
    expect(still.status).toBe("pending");
    const pendingBody = await (await call(user, "/mail/pending?meta=1")).json();
    expect(pendingBody.items[0].recurring.status).toBe("off");
    expect((await supplierRow(user, "edp"))!.senderDomains).toEqual(expect.arrayContaining(["edp.pt"]));

    expect((await call(user, "/mail/recurring-suppliers/edp", { status: "maybe" }, "PUT")).status).toBe(400);
    expect((await call(user, "/mail/recurring-suppliers/worten", { status: "on" }, "PUT")).status).toBe(404);
  });

  it("is per user and needs auth", async () => {
    const a = newUser("owner");
    const b = newUser("owner");
    await seed(a, [netflix()]);
    expect((await (await call(b, "/mail/recurring-suppliers")).json()).suppliers).toEqual([]);
    expect((await call(b, "/mail/recurring-suppliers/netflix", { status: "on" }, "PUT")).status).toBe(404);
    expect((await fetch(`${base}/mail/recurring-suppliers`)).status).toBe(401);
  });
});
