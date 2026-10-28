import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
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
  app.use(["/mail/pending", "/storage/objects"], requireAuthOrGuest, requireProductAccess);
  app.use("/api", storage);
  app.use(gmail, billing);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  for (const id of users) {
    await db.delete(trialUploadsTable).where(eq(trialUploadsTable.userId, id));
    await db.delete(pendingImportsTable).where(eq(pendingImportsTable.userId, id));
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
  const id = `${prefix}-pending-fixture-${randomUUID()}`;
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

describe("GET /mail/pending (ranked list)", () => {
  it("ranks durable highlights, then durable category, then total, then most recent", async () => {
    const user = newUser("owner");
    const rows = await seed(user, [
      { merchant: "Recent cheap", total: 5, purchaseDate: "2026-10-27" },
      { merchant: "Big other", total: 900, category: "Other" },
      { merchant: "Durable cat", total: 40, category: "Home" },
      { merchant: "Notable", total: 30, category: "Other", notableItems: [{ name: "TV", price: 30, category: "Electronics", reason: "warranty" }] },
      { merchant: "Durable cat bigger", total: 60, category: "Electronics" },
      { merchant: "Older cheap", total: 5, purchaseDate: "2026-09-01" },
    ]);
    const res = await call(user, "/mail/pending");
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.map((i: any) => i.merchant)).toEqual([
      "Notable", "Durable cat bigger", "Durable cat", "Big other", "Recent cheap", "Older cheap",
    ]);
    expect(res.headers.get("x-pending-count")).toBe("6");
    expect(list[0]).toMatchObject({ itemCount: 1, firstItemName: "Thing", notableCount: 1 });
    expect(JSON.stringify(list)).not.toContain("SECRET RAW OCR TEXT");
    expect(rows).toHaveLength(6);
  });

  it("wraps items with count and per-currency totals when asked (?meta=1)", async () => {
    const user = newUser("owner");
    await seed(user, [{ total: 10 }, { total: 2.25 }, { total: 7, currency: "USD" }]);
    const body = await (await call(user, "/mail/pending?meta=1")).json();
    expect(body.count).toBe(3);
    expect(body.items).toHaveLength(3);
    expect(body.totals).toEqual([{ currency: "EUR", amount: 12.25 }, { currency: "USD", amount: 7 }]);
  });
});

describe("GET /mail/pending/:id (pending sheet)", () => {
  it("returns the extraction without ocrText plus the private original URL", async () => {
    const user = newUser("owner");
    const [row] = await seed(user, [{ products: [{ name: "Soundbar", quantity: 1, price: 329 }] }]);
    const res = await call(user, `/mail/pending/${row.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.extraction).not.toHaveProperty("ocrText");
    expect(JSON.stringify(body)).not.toContain("SECRET RAW OCR TEXT");
    expect(body.extraction.products).toEqual([{ name: "Soundbar", quantity: 1, price: 329 }]);
    expect(body.originalUrl).toBe(`/api/storage${row.objectPath}`);

    const file = await call(user, `/api${row.objectPath.replace("/objects", "/storage/objects")}`);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("pdf bytes");
  });

  it("is owner-only and pending-only (404 otherwise)", async () => {
    const owner = newUser("owner");
    const other = newUser("owner");
    const [mine] = await seed(owner, [{}]);
    const [handled] = await seed(owner, [{}], "approved");
    expect((await call(other, `/mail/pending/${mine.id}`)).status).toBe(404);
    expect((await call(owner, `/mail/pending/${handled.id}`)).status).toBe(404);
    expect((await call(owner, "/mail/pending/999999999")).status).toBe(404);
    expect((await call(owner, "/mail/pending/abc")).status).toBe(400);
    // Another user can't read the stored original either.
    expect((await call(other, `/api${mine.objectPath.replace("/objects", "/storage/objects")}`)).status).toBe(404);
    expect(fixture.download).not.toHaveBeenCalled();
  });
});

describe("POST /mail/pending/:id/approve with a category override", () => {
  it("saves the chosen category, and rejects unknown categories", async () => {
    const user = newUser("owner");
    const [a, b] = await seed(user, [{ category: "Other" }, { category: "Other" }]);
    expect((await call(user, `/mail/pending/${b.id}/approve`, { category: "Travel" })).status).toBe(400);
    const res = await call(user, `/mail/pending/${a.id}/approve`, { category: "Entertainment" });
    expect(res.status).toBe(200);
    const { receiptId } = await res.json();
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    expect(receipt.category).toBe("Entertainment");
    const plain = await (await call(user, `/mail/pending/${b.id}/approve`, {})).json();
    const [kept] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, plain.receiptId));
    expect(kept.category).toBe("Other");
  });
});

describe("POST /mail/pending/bulk-approve", () => {
  it("approves owned pending items once (idempotent) and reports the rest", async () => {
    const user = newUser("owner");
    const other = newUser("owner");
    const mine = await seed(user, [{ total: 1 }, { total: 2 }]);
    const [foreign] = await seed(other, [{}]);
    const ids = [...mine.map((r) => r.id), foreign.id];
    const body = await (await call(user, "/mail/pending/bulk-approve", { ids })).json();
    expect(body.approved.map((a: any) => a.id).sort()).toEqual(mine.map((r) => r.id).sort());
    expect(body.notFound).toEqual([foreign.id]);
    expect(body.skipped).toEqual([]);
    expect(body.code).toBeUndefined();
    expect(await db.select().from(receiptsTable).where(eq(receiptsTable.userId, user))).toHaveLength(2);
    const [stillForeign] = await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.id, foreign.id));
    expect(stillForeign.status).toBe("pending");

    const again = await (await call(user, "/mail/pending/bulk-approve", { ids: mine.map((r) => r.id) })).json();
    expect(again.approved).toEqual([]);
    expect(await db.select().from(receiptsTable).where(eq(receiptsTable.userId, user))).toHaveLength(2);
  });

  it("validates ids (1-50 positive integers)", async () => {
    const user = newUser("owner");
    expect((await call(user, "/mail/pending/bulk-approve", { ids: [] })).status).toBe(400);
    expect((await call(user, "/mail/pending/bulk-approve", { ids: ["1"] })).status).toBe(400);
    const tooMany = Array.from({ length: 51 }, (_, i) => i + 1);
    expect((await call(user, "/mail/pending/bulk-approve", { ids: tooMany })).status).toBe(400);
  });

  it("answers 409 SYNC_IN_PROGRESS for the whole batch while a sync holds the lock", async () => {
    const user = newUser("owner");
    const rows = await seed(user, [{}, {}]);
    let release!: () => void;
    let held!: () => void;
    const isHeld = new Promise<void>((r) => { held = r; });
    const holder = withUserDataLock(user, () => new Promise<void>((r) => { release = r; held(); }));
    await isHeld;
    try {
      const res = await call(user, "/mail/pending/bulk-approve", { ids: rows.map((r) => r.id) });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("SYNC_IN_PROGRESS");
      const dismiss = await call(user, "/mail/pending/bulk-dismiss", { ids: rows.map((r) => r.id) });
      expect(dismiss.status).toBe(409);
    } finally {
      release();
      await holder;
    }
    const after = await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.userId, user));
    expect(after.every((r) => r.status === "pending")).toBe(true);
    expect(fixture.deleted).toEqual([]);
  }, 15_000);

  it("on the no-card trial approves only the remaining slots, in ranking order", async () => {
    const user = newUser("trial");
    await startTrial(user);
    const rows = await seed(user, Array.from({ length: TRIAL_LIMIT + 2 }, (_, i) => ({ total: 10 + i })));
    // Use 2 slots first: 3 remain.
    const [first, second] = rows;
    expect((await call(user, `/mail/pending/${first.id}/approve`, {})).status).toBe(200);
    expect((await call(user, `/mail/pending/${second.id}/approve`, {})).status).toBe(200);
    const rest = rows.slice(2);
    const res = await call(user, "/mail/pending/bulk-approve", { ids: rest.map((r) => r.id) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("TRIAL_UPLOAD_LIMIT");
    // Highest totals first: the last three seeded rows.
    const byTotal = [...rest].sort((a, b) => (b.extractionData!.total! - a.extractionData!.total!));
    expect(body.approved.map((a: any) => a.id)).toEqual(byTotal.slice(0, 3).map((r) => r.id));
    expect(body.skipped).toEqual(byTotal.slice(3).map((r) => r.id));
    expect((await getSubscriptionStatus(user)).trialUploadsUsed).toBe(TRIAL_LIMIT);
    // At the cap the next batch is refused outright, like a single approval.
    const capped = await call(user, "/mail/pending/bulk-approve", { ids: body.skipped });
    expect(capped.status).toBe(403);
  });
});

describe("POST /mail/pending/bulk-dismiss", () => {
  it("deletes stored files, then only the owner's pending rows whose file is gone", async () => {
    const user = newUser("owner");
    const other = newUser("owner");
    const [a, b, c] = await seed(user, [{}, {}, {}]);
    const [foreign] = await seed(other, [{}]);
    fixture.failDelete.add(c.objectPath);
    const res = await call(user, "/mail/pending/bulk-dismiss", { ids: [a.id, b.id, c.id, foreign.id] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dismissed.sort()).toEqual([a.id, b.id].sort());
    expect(body.failed).toEqual([c.id]);
    expect(body.notFound).toEqual([foreign.id]);
    expect(fixture.deleted.sort()).toEqual([a.objectPath, b.objectPath].sort());
    const left = await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.userId, user));
    expect(left.map((r) => r.id)).toEqual([c.id]);
    expect(await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.id, foreign.id))).toHaveLength(1);
  });
});
