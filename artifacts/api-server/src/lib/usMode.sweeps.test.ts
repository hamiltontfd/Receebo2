/**
 * US mode, reminders end to end on the real dev/test PostgreSQL: the daily
 * sweeps read each account's region. Email and push delivery are mocked;
 * everything else (region lookup, store table, claims) is real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db, receiptsTable, userPreferencesTable } from "@workspace/db";

const fx = vi.hoisted(() => ({ users: new Set<string>(), warrantyEmail: vi.fn(), returnEmail: vi.fn(), push: vi.fn() }));
vi.mock("./subscriptionStatus", () => ({
  getSubscriptionStatus: async (userId: string) => ({ canUseApp: fx.users.has(userId), accessState: "paid" }),
}));
vi.mock("./emailService", () => ({
  sendWarrantyReminderEmail: fx.warrantyEmail,
  sendReturnWindowEmail: fx.returnEmail,
  sendTrialEndingEmail: async () => true,
}));
vi.mock("./pushNotifications", () => ({ sendPushNotification: fx.push }));
import { runReturnWindowSweep, runWarrantyReminderSweep } from "./orphanCleanup";

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const us = `us-sweep-${randomUUID()}`;
const pt = `pt-sweep-${randomUUID()}`;
const ids: Record<string, number> = {};

async function receipt(name: string, userId: string, values: Partial<typeof receiptsTable.$inferInsert>) {
  const [row] = await db.insert(receiptsTable).values({
    userId, objectPath: `/objects/uploads/${randomUUID()}`, originalFileName: `${name}.jpg`, contentType: "image/jpeg",
    status: "completed", isDraft: false, ...values,
  }).returning({ id: receiptsTable.id });
  ids[name] = row.id;
}

beforeAll(async () => {
  fx.users.add(us); fx.users.add(pt);
  for (const f of [fx.warrantyEmail, fx.returnEmail, fx.push]) f.mockImplementation(async (uid: string) => fx.users.has(uid));
  await db.insert(userPreferencesTable).values({ userId: us, market: "US" });
  const tv = { merchant: "Best Buy", currency: "USD", purchaseCountry: "US", category: "Electronics", total: 1299.99,
    products: [{ name: 'LG 65" OLED TV', price: 1299.99 }] };
  // In store at Best Buy, 14 days ago: the 15-day store window closes tomorrow.
  await receipt("usInStoreTv", us, { ...tv, isOnlinePurchase: false, purchaseDate: iso(-14) });
  await receipt("ptInStoreTv", pt, { ...tv, isOnlinePurchase: false, purchaseDate: iso(-14) });
  // Unknown store: never a guessed window.
  await receipt("usCornerShop", us, { ...tv, merchant: "Corner Electronics", isOnlinePurchase: false, purchaseDate: iso(-14) });
  // The user's own window wins: 20 days from 19 days ago = tomorrow (store table would say 15 = already closed).
  await receipt("usOwnWindow", us, { ...tv, isOnlinePurchase: false, purchaseDate: iso(-19), returnDays: 20 });
  // EUR receipt bought ~2 years ago in the EU: legal warranty (EU 2y) ends in 10 days; manufacturer in 20.
  const old = new Date(Date.now() + 10 * DAY); old.setUTCFullYear(old.getUTCFullYear() - 2);
  const warranty = { merchant: "Media Markt", currency: "EUR", category: "Electronics", isOnlinePurchase: true,
    purchaseDate: old.toISOString().slice(0, 10), warranty: `Manufacturer warranty until ${iso(20)}` };
  await receipt("usEurWarranty", us, warranty);
  await receipt("ptEurWarranty", pt, warranty);
});
afterAll(async () => {
  await db.delete(receiptsTable).where(inArray(receiptsTable.userId, [us, pt]));
  await db.delete(userPreferencesTable).where(inArray(userPreferencesTable.userId, [us, pt]));
});

const callsFor = (fn: ReturnType<typeof vi.fn>, id: number) => fn.mock.calls.filter(([, r]) => (r.id ?? r.receiptId) === id);

describe("US mode sweeps (real PostgreSQL)", () => {
  it("return reminders: US in-store purchase at a known store, user window wins, unknown store and PT unchanged", async () => {
    await runReturnWindowSweep();
    const [inStore] = callsFor(fx.returnEmail, ids.usInStoreTv);
    expect(inStore?.[1]).toMatchObject({ basis: "store", windowDays: 15, daysRemaining: 1 });
    expect(fx.push.mock.calls.some(([uid, p]) => uid === us && p.receiptId === ids.usInStoreTv)).toBe(true);
    expect(callsFor(fx.returnEmail, ids.usOwnWindow)[0]?.[1]).toMatchObject({ basis: "user", windowDays: 20, daysRemaining: 1 });
    expect(callsFor(fx.returnEmail, ids.usCornerShop)).toHaveLength(0);
    // PT account: in-store purchases still have no return window (EU rules).
    expect(callsFor(fx.returnEmail, ids.ptInStoreTv)).toHaveLength(0);
  });

  it("warranty reminders: US accounts get only the manufacturer's, PT accounts both", async () => {
    await runWarrantyReminderSweep();
    const usCalls = callsFor(fx.warrantyEmail, ids.usEurWarranty).map(([, r]) => r);
    expect(usCalls).toHaveLength(1);
    expect(usCalls[0]).toMatchObject({ kind: "manufacturer", expiresOn: iso(20), other: null });
    const usPushes = fx.push.mock.calls.filter(([uid, p]) => uid === us && p.receiptId === ids.usEurWarranty);
    expect(usPushes).toHaveLength(1);
    expect(usPushes[0][1].title).toMatch(/^Manufacturer warranty ends/);
    const ptKinds = callsFor(fx.warrantyEmail, ids.ptEurWarranty).map(([, r]) => r.kind).sort();
    expect(ptKinds).toEqual(["legal", "manufacturer"]);
  });
});
