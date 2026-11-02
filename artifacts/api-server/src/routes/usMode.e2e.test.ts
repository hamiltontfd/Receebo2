/**
 * US mode end to end on the real PostgreSQL (F): the server sees a US visitor,
 * the account's market is filled from that once, the user edits a receipt's
 * return window, and the daily sweep sends an en-US-rules reminder. A PT
 * account made the same way keeps EU rules (no in-store return window).
 * Only Clerk session verification and email/push delivery are mocked.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db, receiptsTable, userPreferencesTable } from "@workspace/db";

const fx = vi.hoisted(() => ({ users: new Set<string>(), returnEmail: vi.fn(), warrantyEmail: vi.fn(), push: vi.fn() }));
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-session"] ?? null }),
}));
vi.mock("../lib/legalAcceptance", () => ({ hasCurrentLegalAcceptance: async () => true }));
vi.mock("../lib/accountDeletionState", () => ({ isAccountDeletionInProgress: async () => false }));
vi.mock("../middlewares/guestAuth", () => ({
  requireAuthOrGuest: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.userId = req.headers["x-test-session"] as string;
    if (req.userId) next(); else res.sendStatus(401);
  },
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async (userId: string) => ({ canUseApp: fx.users.has(userId), accessState: "paid" }),
  receiptCapReached: () => false,
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {}, ObjectNotFoundError: class extends Error {}, objectStorageClient: {},
}));
vi.mock("../lib/emailService", () => ({
  sendWarrantyReminderEmail: fx.warrantyEmail,
  sendReturnWindowEmail: fx.returnEmail,
  sendTrialEndingEmail: async () => true,
}));
vi.mock("../lib/pushNotifications", () => ({ sendPushNotification: fx.push }));
import market from "./market";
import receipts from "./receipts";
import { runReturnWindowSweep } from "../lib/orphanCleanup";

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const us = `us-e2e-${randomUUID()}`;
const pt = `pt-e2e-${randomUUID()}`;
const ids: Record<string, number> = {};
let server: Server;
let base: string;

beforeAll(async () => {
  fx.users.add(us); fx.users.add(pt);
  for (const f of [fx.returnEmail, fx.warrantyEmail, fx.push]) f.mockImplementation(async (uid: string) => fx.users.has(uid));
  const app = express();
  app.use(express.json(), market, receipts);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const [name, userId] of [["us", us], ["pt", pt]] as const) {
    const [row] = await db.insert(receiptsTable).values({
      userId, objectPath: `/objects/uploads/${randomUUID()}`, originalFileName: "tv.jpg", contentType: "image/jpeg",
      status: "completed", isDraft: false, merchant: "Corner Electronics", currency: "USD", purchaseCountry: "US",
      category: "Electronics", total: 899, isOnlinePurchase: false, purchaseDate: iso(-9),
    }).returning({ id: receiptsTable.id });
    ids[name] = row.id;
  }
});
afterAll(async () => {
  delete process.env.MARKET_DEV_COUNTRY;
  await new Promise<void>((done) => server.close(() => done()));
  await db.delete(receiptsTable).where(inArray(receiptsTable.userId, [us, pt]));
  await db.delete(userPreferencesTable).where(inArray(userPreferencesTable.userId, [us, pt]));
});
const call = (path: string, user: string, body?: object) => fetch(`${base}${path}`, {
  method: body ? "PATCH" : "GET",
  headers: { "x-test-session": user, "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

describe("US mode end to end (real PostgreSQL)", () => {
  it("IP market -> account market -> user's return window -> US reminder; PT account keeps EU rules", async () => {
    process.env.MARKET_DEV_COUNTRY = "US";
    expect(await (await call("/account/market", us)).json()).toEqual({ market: "US", country: "US" });
    process.env.MARKET_DEV_COUNTRY = "PT";
    expect(await (await call("/account/market", pt)).json()).toEqual({ market: "PT", country: "PT" });
    // Later visits from elsewhere never replace the saved market.
    expect(await (await call("/account/market", us)).json()).toEqual({ market: "US", country: "PT" });

    // Unknown store: the user sets their own 10-day window on both receipts.
    for (const name of ["us", "pt"]) {
      expect((await call(`/receipts/${ids[name]}`, name === "us" ? us : pt, { returnDays: 10 })).status).toBe(200);
    }
    await runReturnWindowSweep();
    const usCall = fx.returnEmail.mock.calls.find(([, r]) => (r.id ?? r.receiptId) === ids.us);
    expect(usCall?.[1]).toMatchObject({ basis: "user", windowDays: 10, daysRemaining: 1 });
    expect(fx.push.mock.calls.some(([uid]) => uid === us)).toBe(true);
    // PT account, in-store purchase: EU rules have no in-store return right, so no reminder.
    expect(fx.returnEmail.mock.calls.some(([uid]) => uid === pt)).toBe(false);
  });
});
