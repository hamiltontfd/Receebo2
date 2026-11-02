import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, receiptsTable, userPreferencesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// Run real auth middleware, DB writes and locks. Clerk session verification alone
// is replaced in this local HTTP harness; production never reads these headers.
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-session"] ?? null }),
}));
vi.mock("../lib/legalAcceptance", () => ({ hasCurrentLegalAcceptance: async () => true }));
vi.mock("../lib/accountDeletionState", () => ({
  isAccountDeletionInProgress: async (id: string) => id === "deleting-fixture",
}));
vi.mock("../middlewares/guestAuth", () => ({
  requireAuthOrGuest: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.userId = req.headers["x-test-session"] as string;
    if (req.userId) next(); else res.sendStatus(401);
  },
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, accessState: "paid" }),
  receiptCapReached: () => false,
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {}, ObjectNotFoundError: class extends Error {}, objectStorageClient: {},
}));
import market from "./market";
import notifications from "./notifications";
import receipts from "./receipts";

const A = `market-fixture-${randomUUID()}`;
const B = `market-fixture-${randomUUID()}`;
let server: Server;
let base: string;
let receiptId: number;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), market, notifications, receipts);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const [receipt] = await db.insert(receiptsTable).values({
    userId: A, objectPath: `/objects/${randomUUID()}`, originalFileName: "test.pdf", contentType: "application/pdf",
    status: "completed", isDraft: false, merchant: "Portuguese shop", purchaseCountry: "PT",
    currency: "EUR", category: "Electronics", purchaseDate: "2026-01-01", isOnlinePurchase: true,
    returnReminderSent7dAt: new Date(), returnReminderSent2dAt: new Date(),
  }).returning({ id: receiptsTable.id });
  receiptId = receipt.id;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  for (const user of [A, B]) {
    await db.delete(receiptsTable).where(eq(receiptsTable.userId, user));
    await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, user));
  }
});
function call(path: string, user: string | null, body?: object) {
  return fetch(`${base}${path}`, {
    method: body ? "PATCH" : "GET",
    headers: { ...(user ? { "x-test-session": user } : {}), "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("market API with real PostgreSQL", () => {
  it("language requires an account, rejects invalid values and blocks account deletion", async () => {
    expect((await call("/account/language", null)).status).toBe(401);
    expect((await call("/account/language", null, { language: "en" })).status).toBe(401);
    expect((await fetch(`${base}/account/language`, { headers: { "x-guest-id": "guest" } })).status).toBe(401);
    expect((await call("/account/language", "deleting-fixture", { language: "en" })).status).toBe(423);
    for (const body of [{}, { language: "fr" }, { language: "PT" }, { language: 1 }, { language: "en", market: "BR" }]) {
      expect((await call("/account/language", A, body)).status).toBe(400);
    }
    const response = await call("/account/language", A);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ language: null });
  });
  it("public suggestion is uncached and rejects query/header supplied IPs from the private peer", async () => {
    const response = await fetch(`${base}/market/suggestion?ip=8.8.8.8`, {
      headers: { "x-forwarded-for": "8.8.8.8", "cf-connecting-ip": "8.8.8.8", "x-real-ip": "8.8.8.8" },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ country: null, market: null });
  });
  it("requires a real session for reads/writes, rejects guest tokens and blocks deletion in progress", async () => {
    expect((await call("/account/market", null)).status).toBe(401);
    expect((await call("/account/market", null, { market: "BR" })).status).toBe(401);
    expect((await fetch(`${base}/account/market`, { headers: { "x-guest-id": "guest" } })).status).toBe(401);
    expect((await call("/account/market", "deleting-fixture", { market: "BR" })).status).toBe(423);
  });
  it("starts absent, never silently PT, and GET does not create preferences", async () => {
    const response = await call("/account/market", A);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ market: null, country: null });
    expect(await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, A))).toHaveLength(0);
  });
  it("server-side GeoIP fills an empty account market once, never replaces one, and leaves uncovered countries empty", async () => {
    const C = `market-fixture-${randomUUID()}`;
    const D = `market-fixture-${randomUUID()}`;
    const nodeEnv = process.env.NODE_ENV;
    try {
      process.env.MARKET_DEV_COUNTRY = "US";
      expect(await (await call("/account/market", C)).json()).toEqual({ market: "US", country: "US" });
      const [row] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, C));
      expect(row.market).toBe("US");
      // Another country later (travel, VPN) never replaces the saved market.
      process.env.MARKET_DEV_COUNTRY = "BR";
      expect(await (await call("/account/market", C)).json()).toEqual({ market: "US", country: "BR" });
      // Uncovered country: nothing saved, the country is returned for the notice.
      process.env.MARKET_DEV_COUNTRY = "JP";
      expect(await (await call("/account/market", D)).json()).toEqual({ market: null, country: "JP" });
      expect(await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, D))).toHaveLength(0);
      expect(await (await fetch(`${base}/market/suggestion`)).json()).toEqual({ country: "JP", market: null });
      // The dev override is ignored in production.
      process.env.NODE_ENV = "production";
      expect(await (await fetch(`${base}/market/suggestion`)).json()).toEqual({ country: null, market: null });
    } finally {
      process.env.NODE_ENV = nodeEnv;
      delete process.env.MARKET_DEV_COUNTRY;
      await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, C));
      await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, D));
    }
  });
  it("I'm interested: aggregate count per uncovered country only, nothing about the person", async () => {
    const post = (body: unknown) => fetch(`${base}/market/interest`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const count = async (c: string) => {
      const r = await db.execute(sql`SELECT count FROM market_interest_counts WHERE country = ${c}`);
      return r.rows.length ? Number((r.rows[0] as { count: number }).count) : 0;
    };
    const before = await count("JP");
    expect((await post({ country: "jp" })).status).toBe(204);
    expect((await post({ country: "JP" })).status).toBe(204);
    expect(await count("JP")).toBe(before + 2);
    for (const body of [{ country: "US" }, { country: "PT" }, { country: "BR" }, { country: "ZZ" }, { country: "EU" }, {}, { country: 1 }]) {
      expect((await post(body)).status).toBe(400);
    }
    // The table has no column that could hold a user, an IP or a device.
    const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'market_interest_counts' ORDER BY column_name`);
    expect(cols.rows.map((r) => (r as { column_name: string }).column_name)).toEqual(["count", "country", "updated_at"]);
    // A server-detected country wins over the body.
    process.env.MARKET_DEV_COUNTRY = "KR";
    const kr = await count("KR");
    try { expect((await post({ country: "JP" })).status).toBe(204); } finally { delete process.env.MARKET_DEV_COUNTRY; }
    expect(await count("KR")).toBe(kr + 1);
  });
  it("validates enum, body, ownership fields and transfer flag", async () => {
    for (const body of [{}, { market: null }, { market: "EU" }, { market: "pt" }, { market: "BR", userId: B }, { market: "BR", onlyIfUnset: "yes" }]) {
      expect((await call("/account/market", A, body)).status).toBe(400);
    }
  });
  it("saves for any authenticated account, preserving notification opt-out", async () => {
    await db.insert(userPreferencesTable).values({ userId: A, notificationsOptOut: true });
    const response = await call("/account/market", A, { market: "BR" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ market: "BR", country: null });
    const [row] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, A));
    expect(row.notificationsOptOut).toBe(true);
    expect(await (await call("/account/market", B)).json()).toEqual({ market: null, country: null });
  });
  it("notification update does not remove the saved market", async () => {
    expect((await call("/notifications/preferences", A, { optOut: false })).status).toBe(200);
    expect(await (await call("/account/market", A)).json()).toEqual({ market: "BR", country: null });
  });
  it("atomic visitor adoption cannot override an existing choice", async () => {
    expect(await (await call("/account/market", A, { market: "US", onlyIfUnset: true })).json()).toEqual({ market: "BR", country: null });
    expect(await (await call("/account/market", B, { market: "US", onlyIfUnset: true })).json()).toEqual({ market: "US", country: null });
    await Promise.all([
      call("/account/market", B, { market: "BR" }),
      call("/account/market", B, { market: "PT", onlyIfUnset: true }),
    ]);
    expect(await (await call("/account/market", B)).json()).toEqual({ market: "BR", country: null });
  });
  it("account market change never rewrites purchase data or reminder state", async () => {
    const [before] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    await call("/account/market", A, { market: "US" });
    const [after] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    expect(after).toEqual(before);
    expect(after.purchaseCountry).toBe("PT");
    expect(after.currency).toBe("EUR");
  });
  it("purchase corrections require ownership and real ISO codes", async () => {
    expect((await call(`/receipts/${receiptId}`, B, { purchaseCountry: "BR" })).status).toBe(404);
    for (const purchaseCountry of ["EU", "ZZ", "pt", "", "BRA", 4]) {
      expect((await call(`/receipts/${receiptId}`, A, { purchaseCountry })).status).toBe(400);
    }
  });
  it("persists and resets language independently, without changing purchases or other preferences", async () => {
    const [receiptBefore] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    const [prefsBefore] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, A));
    for (const language of ["pt-BR", "pt-PT", "en", null]) {
      const saved = await call("/account/language", A, { language });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({ language });
      expect(await (await call("/account/language", A)).json()).toEqual({ language });
    }
    const [prefsAfter] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, A));
    expect(prefsAfter.market).toBe(prefsBefore.market);
    expect(prefsAfter.notificationsOptOut).toBe(prefsBefore.notificationsOptOut);
    expect((await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId)))[0]).toEqual(receiptBefore);
    await call("/account/language", A, { language: "pt-BR" });
    expect(await (await call("/account/language", B)).json()).toEqual({ language: null });
    await call("/account/market", A, { market: "US" });
    expect(await (await call("/account/language", A)).json()).toEqual({ language: "pt-BR" });
  });
  it("preserves actual EU country and rearms/recalculates existing rules and reminders", async () => {
    const response = await call(`/receipts/${receiptId}`, A, { purchaseCountry: "DE" });
    expect(response.status).toBe(200);
    expect((await response.json()).purchaseCountry).toBe("DE");
    const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    expect(row.purchaseCountry).toBe("DE");
    expect(row.legalWarrantyExpiresOn).toBe("2028-01-01");
    expect(row.returnReminderSent7dAt).toBeNull();
    expect(row.returnReminderSent2dAt).toBeNull();
    expect(await (await call("/account/market", A)).json()).toEqual({ market: "US", country: null });
  });
  it("can clear the purchase country to Unknown without deriving it from account or currency", async () => {
    expect((await call(`/receipts/${receiptId}`, A, { purchaseCountry: null })).status).toBe(200);
    const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    expect(row.purchaseCountry).toBeNull();
    expect(row.currency).toBe("EUR");
  });
});
