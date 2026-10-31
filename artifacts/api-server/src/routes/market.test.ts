import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, receiptsTable, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
    expect(await response.json()).toEqual({ market: null });
    expect(await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, A))).toHaveLength(0);
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
    expect(await response.json()).toEqual({ market: "BR" });
    const [row] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, A));
    expect(row.notificationsOptOut).toBe(true);
    expect(await (await call("/account/market", B)).json()).toEqual({ market: null });
  });
  it("notification update does not remove the saved market", async () => {
    expect((await call("/notifications/preferences", A, { optOut: false })).status).toBe(200);
    expect(await (await call("/account/market", A)).json()).toEqual({ market: "BR" });
  });
  it("atomic visitor adoption cannot override an existing choice", async () => {
    expect(await (await call("/account/market", A, { market: "US", onlyIfUnset: true })).json()).toEqual({ market: "BR" });
    expect(await (await call("/account/market", B, { market: "US", onlyIfUnset: true })).json()).toEqual({ market: "US" });
    await Promise.all([
      call("/account/market", B, { market: "BR" }),
      call("/account/market", B, { market: "PT", onlyIfUnset: true }),
    ]);
    expect(await (await call("/account/market", B)).json()).toEqual({ market: "BR" });
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
  it("preserves actual EU country and rearms/recalculates existing rules and reminders", async () => {
    const response = await call(`/receipts/${receiptId}`, A, { purchaseCountry: "DE" });
    expect(response.status).toBe(200);
    expect((await response.json()).purchaseCountry).toBe("DE");
    const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    expect(row.purchaseCountry).toBe("DE");
    expect(row.legalWarrantyExpiresOn).toBe("2028-01-01");
    expect(row.returnReminderSent7dAt).toBeNull();
    expect(row.returnReminderSent2dAt).toBeNull();
    expect(await (await call("/account/market", A)).json()).toEqual({ market: "US" });
  });
  it("can clear the purchase country to Unknown without deriving it from account or currency", async () => {
    expect((await call(`/receipts/${receiptId}`, A, { purchaseCountry: null })).status).toBe(200);
    const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    expect(row.purchaseCountry).toBeNull();
    expect(row.currency).toBe("EUR");
  });
});
