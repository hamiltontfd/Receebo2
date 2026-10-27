import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  db, accountTrialsTable, trialUploadsTable, uploadIntentsTable, receiptsTable,
  pendingImportsTable, userBillingTable, guestSessionsTable,
  trialFunnelSubjectsTable,
} from "@workspace/db";

const fixture = vi.hoisted(() => ({
  extraction: vi.fn(), check: vi.fn(), checkout: vi.fn(),
  returnEmail: vi.fn(), push: vi.fn(), warrantyEmail: vi.fn(),
  liveSubscriptions: [] as Array<{ status: string }>,
}));
// Authentication only is replaced for this local HTTP harness. Entitlements,
// transactions, cross-connection advisory locks and quota persistence are real.
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
  requireCurrentLegalAcceptance: (req: any, res: any, next: any) =>
    req.headers["x-test-consent"] === "accepted" ? next() : res.sendStatus(428),
}));
vi.mock("../lib/ownerAccess", () => ({ hasOwnerAccess: async () => false }));
vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [] }) } },
}));
vi.mock("../lib/emailService", () => ({
  sendWarrantyReminderEmail: fixture.warrantyEmail,
  sendTrialEndingEmail: async () => true,
  sendReturnWindowEmail: fixture.returnEmail,
}));
vi.mock("../lib/pushNotifications", () => ({ sendPushNotification: fixture.push }));
vi.mock("../lib/receiptExtraction", () => ({
  checkIsReceipt: fixture.check, extractReceiptData: fixture.extraction,
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    getObjectEntityUploadURL = async () => `https://uploads.invalid/${randomUUID()}`;
    normalizeObjectEntityPath = (url: string) => `/objects/uploads/${url.split("/").pop()}`;
    deleteObject = async () => {};
  },
  objectStorageClient: {},
}));
vi.mock("../stripeClient", () => ({
  getUncachableStripeClient: async () => ({
    prices: { retrieve: async (id: string) => ({
      id, active: true, livemode: false, currency: "eur",
      unit_amount: id.includes("yearly") ? 2499 : 299,
      recurring: { interval: id.includes("yearly") ? "year" : "month", interval_count: 1 },
    }) },
    customers: { create: async () => ({ id: `cus_fixture_${randomUUID()}` }) },
    subscriptions: { list: async () => ({ data: fixture.liveSubscriptions }) },
    checkout: { sessions: {
      list: async () => ({ data: [] }), create: fixture.checkout,
    } },
  }),
}));

import billing from "./billing";
import storage from "./storage";
import receipts from "./receipts";
import attachments from "./attachments";
import gmail from "./gmail";
import guest from "./guestSession";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { requireProductAccess } from "../middlewares/productAccess";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import {
  trialState, TRIAL_DURATION_MS, TRIAL_LIMIT, TRIAL_CAP_MESSAGE, extendTrialsToCurrentDuration, uncountUnsavedTrialDrafts,
} from "../lib/accountTrial";
import { runReturnWindowSweep, runWarrantyReminderSweep } from "../lib/orphanCleanup";
import { claimScheduledRun } from "../lib/scheduledJobLock";
import { scheduledJobRunsTable } from "@workspace/db";
import { calcReturnWindow } from "../lib/returnWindowCalc";
import { migrateTrialAiReads, TRIAL_AI_READ_LIMIT, TRIAL_AI_READS_MESSAGE, claimTrialAiRead, countTrialAiReads } from "../lib/trialAiReads";
import { sql } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

let server: Server;
let base: string;
let userId: string;
const users: string[] = [];
const guestTokens: string[] = [];
const extractionData = {
  isReceipt: true, merchant: "Fixture store", purchaseDate: "2026-10-20",
  total: 12.5, currency: "EUR", category: "Other", summary: "Fixture receipt",
  ocrText: "", warranty: null, transactionNumber: null,
  products: [], notableItems: [], purchaseCountry: "IE", isOnlinePurchase: false,
};

beforeAll(async () => {
  await migrateTrialAiReads();
  const app = express();
  app.use(express.json(), (req, _res, next) => {
    req.log = { error() {}, warn() {}, info() {} } as any;
    next();
  });
  app.use(["/receipts", "/gmail/pending"], requireAuthOrGuest, requireProductAccess);
  app.use(billing, storage, receipts, attachments, gmail, guest);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(done => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  for (const id of users) {
    await db.delete(trialUploadsTable).where(eq(trialUploadsTable.userId, id));
    await db.delete(uploadIntentsTable).where(eq(uploadIntentsTable.userId, id));
    await db.delete(pendingImportsTable).where(eq(pendingImportsTable.userId, id));
    await db.delete(receiptsTable).where(eq(receiptsTable.userId, id));
    await db.delete(userBillingTable).where(eq(userBillingTable.userId, id));
    await db.delete(accountTrialsTable).where(eq(accountTrialsTable.userId, id));
    await db.delete(trialFunnelSubjectsTable).where(eq(trialFunnelSubjectsTable.userId, id));
    await db.execute(sql`DELETE FROM trial_ai_reads WHERE user_id = ${id}`);
  }
  for (const token of guestTokens) await db.delete(guestSessionsTable).where(eq(guestSessionsTable.token, token));
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("STRIPE_TEST_MONTHLY_PRICE_ID", "price_monthly_original");
  vi.stubEnv("STRIPE_TEST_YEARLY_PRICE_ID", "price_yearly_original");
  vi.stubEnv("REPLIT_DEV_DOMAIN", "fixture.replit.dev");
  userId = `account-trial-fixture-${randomUUID()}`;
  users.push(userId);
  fixture.check.mockReset().mockResolvedValue(true);
  fixture.extraction.mockReset().mockResolvedValue(extractionData);
  fixture.checkout.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/fixture" });
  fixture.liveSubscriptions = [];
});
afterEach(() => vi.unstubAllEnvs());

function request(path: string, body?: object, method = body ? "POST" : "GET", consent = true) {
  return fetch(`${base}${path}`, {
    method, headers: { "content-type": "application/json", "x-test-user": userId,
      ...(consent ? { "x-test-consent": "accepted" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function start() {
  expect((await request("/billing/start-trial", {})).status).toBe(200);
}
async function url() {
  return request("/storage/uploads/request-url", { name: "receipt.pdf", size: 100, contentType: "application/pdf" });
}
/** Upload + extraction, leaving the receipt as an unsaved draft. */
async function uploadDraft() {
  const issuance = await url();
  expect(issuance.status).toBe(200);
  const { objectPath } = await issuance.json();
  const response = await request("/receipts", { objectPath, originalFileName: "receipt.pdf", contentType: "application/pdf" });
  expect(response.status).toBe(201);
  const receipt = await response.json();
  await expect.poll(async () => {
    const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
    return row.status;
  }, { timeout: 8000 }).not.toBe("processing");
  return receipt;
}
/** Upload, extraction and the user's Save after review (what counts toward the cap). */
async function upload() {
  const receipt = await uploadDraft();
  const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
  if (row.status === "completed") {
    expect((await request(`/receipts/${receipt.id}`, { isDraft: false }, "PATCH")).status).toBe(200);
  }
  return receipt;
}

describe("durable no-card account trial (real PostgreSQL, isolated users)", () => {
  it("starts only after consent, once across simultaneous devices, without a customer", async () => {
    expect((await request("/billing/start-trial", {}, "POST", false)).status).toBe(428);
    expect((await getSubscriptionStatus(userId)).accessState).toBe("not_started");
    await Promise.all([start(), start(), start()]);
    const status = await getSubscriptionStatus(userId);
    expect(status).toMatchObject({ plan: "trialing", accessState: "account_trial",
      trialUploadsRemaining: TRIAL_LIMIT, foundingEligible: true, canUpload: true });
    expect(TRIAL_LIMIT).toBe(5);
    expect(TRIAL_DURATION_MS).toBe(15 * DAY_MS);
    const [trial] = await db.select().from(accountTrialsTable).where(eq(accountTrialsTable.userId, userId));
    expect(trial.endsAt.getTime() - trial.startedAt.getTime()).toBe(TRIAL_DURATION_MS);
    await start();
    expect((await getSubscriptionStatus(userId)).trialEndAt).toEqual(trial.endsAt);
    expect(await db.select().from(userBillingTable).where(eq(userBillingTable.userId, userId))).toHaveLength(0);
    expect(fixture.checkout).not.toHaveBeenCalled();
  });
  it("expires at exactly fifteen days and never resets on reentry", async () => {
    const end = new Date("2026-10-26T12:00:00Z");
    expect(trialState(end, 0, new Date(end.getTime() - 1))).toBe("account_trial");
    expect(trialState(end, 0, end)).toBe("trial_expired");
    await start();
    const expired = new Date(Date.now() - 1);
    await db.update(accountTrialsTable).set({ endsAt: expired }).where(eq(accountTrialsTable.userId, userId));
    await start();
    expect((await getSubscriptionStatus(userId))).toMatchObject({ accessState: "trial_expired", canUseApp: false });
    expect((await url()).status).toBe(403);
    expect((await request("/receipts")).status).toBe(403);
  });
  it("day 1: 0-4 receipts can add; the 5th makes the account view-only; deletion never restores uses", async () => {
    await start();
    const first = await upload();
    expect((await request(`/receipts/${first.id}`, undefined, "DELETE")).status).toBe(204);
    for (let used = 1; used < TRIAL_LIMIT; used++) {
      expect(await getSubscriptionStatus(userId)).toMatchObject({
        accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsUsed: used,
      });
      if (used < TRIAL_LIMIT - 1) await upload();
    }
    const fifth = await upload();
    expect(await getSubscriptionStatus(userId)).toMatchObject({
      accessState: "trial_exhausted", canUseApp: true, canUpload: false,
      trialUploadsUsed: TRIAL_LIMIT, trialUploadsRemaining: 0,
    });
    // Viewing stays open until day 15: list, search, detail, edit, files.
    expect((await request("/receipts")).status).toBe(200);
    expect((await request("/receipts?search=Fixture")).status).toBe(200);
    expect((await request(`/receipts/${fifth.id}`)).status).toBe(200);
    expect((await request(`/receipts/${fifth.id}`, { isDraft: false, merchant: "Edited" }, "PATCH")).status).toBe(200);
    // Adding a 6th is refused with the exact copy.
    const sixth = await url();
    expect(sixth.status).toBe(403);
    expect(await sixth.json()).toMatchObject({ code: "trial_exhausted", message: TRIAL_CAP_MESSAGE });
  }, 30000);
  it("blocks every add path at the cap (upload, create, manual accept, email approve, guest claim) without running AI", async () => {
    expect(TRIAL_CAP_MESSAGE).toBe("You've used your 5 free receipts. Subscribe to add more.");
    await start();
    fixture.extraction.mockRejectedValue(new Error("Fixture extraction failed"));
    const failed = await upload(); // final failure: released, not counted
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(0);
    fixture.extraction.mockResolvedValue(extractionData);
    for (let i = 0; i < TRIAL_LIMIT - 1; i++) await upload();
    // A slot reserved on this device while another device takes the 5th success.
    const { objectPath: stale } = await (await url()).json();
    const [trial] = await db.select().from(accountTrialsTable).where(eq(accountTrialsTable.userId, userId));
    await db.insert(trialUploadsTable).values({
      userId, objectPath: `/objects/uploads/other-device-${randomUUID()}`, state: "succeeded", expiresAt: trial.endsAt,
    });
    expect((await getSubscriptionStatus(userId)).accessState).toBe("trial_exhausted");
    const extractionCalls = fixture.extraction.mock.calls.length;

    const expectCap = async (res: Response) => {
      expect(res.status).toBe(403);
      expect((await res.json()).message).toContain(TRIAL_CAP_MESSAGE);
    };
    await expectCap(await url());
    await expectCap(await request("/receipts", { objectPath: stale, originalFileName: "late.pdf", contentType: "application/pdf" }));
    await expectCap(await request(`/receipts/${failed.id}`, { isDraft: false, merchant: "Manual" }, "PATCH"));
    const [imp] = await db.insert(pendingImportsTable).values({
      userId, gmailMessageId: randomUUID(), objectPath: `/objects/uploads/gmail-${randomUUID()}`,
      originalFileName: "gmail.pdf", extractionData,
    }).returning();
    await expectCap(await request(`/gmail/pending/${imp.id}/approve`, {}));
    const token = randomUUID();
    guestTokens.push(token); users.push(token);
    await db.insert(guestSessionsTable).values({ token });
    await db.insert(receiptsTable).values({
      userId: token, objectPath: `/objects/uploads/guest-${randomUUID()}`,
      originalFileName: "guest.pdf", contentType: "application/pdf", status: "completed",
    });
    await expectCap(await request("/guest-session/claim", { guestToken: token }));
    expect(await db.select().from(receiptsTable).where(eq(receiptsTable.userId, token))).toHaveLength(1);

    // Extra pages for an existing receipt are still allowed (not a new receipt, no AI).
    const [kept] = await db.select().from(receiptsTable).where(eq(receiptsTable.userId, userId)).limit(1);
    expect((await request("/storage/uploads/request-url", {
      receiptId: kept.id, name: "page2.pdf", size: 10, contentType: "application/pdf",
    })).status).toBe(200);
    // Mail sync is skipped via canUpload=false (mailSync/gmailSync check it before any AI).
    const status = await getSubscriptionStatus(userId);
    expect(status).toMatchObject({ canUseApp: true, canUpload: false, trialUploadsUsed: TRIAL_LIMIT });
    expect(fixture.extraction.mock.calls.length).toBe(extractionCalls);
  }, 30000);
  it("shows the paywall on day 16 even below the receipt cap", async () => {
    await start();
    await upload();
    const startedAt = new Date(Date.now() - 16 * DAY_MS);
    await db.update(accountTrialsTable).set({ startedAt, endsAt: new Date(startedAt.getTime() + TRIAL_DURATION_MS) })
      .where(eq(accountTrialsTable.userId, userId));
    expect(await getSubscriptionStatus(userId)).toMatchObject({ accessState: "trial_expired", canUseApp: false, canUpload: false });
    expect((await request("/receipts")).status).toBe(403);
    expect((await url()).status).toBe(403);
  });
  it("keeps sending return-window email and push alerts to a trial at the receipt cap", async () => {
    await start();
    const receipts = [];
    for (let i = 0; i < TRIAL_LIMIT; i++) receipts.push(await upload());
    expect((await getSubscriptionStatus(userId)).accessState).toBe("trial_exhausted");
    // Pick a purchase date whose online-return window closes within a day.
    let purchaseDate = "";
    for (let d = 0; d < 60 && !purchaseDate; d++) {
      const iso = new Date(Date.now() - d * DAY_MS).toISOString().slice(0, 10);
      const w = calcReturnWindow({ purchaseDate: iso, purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Fixture store" });
      if (w && w.daysRemaining >= 0 && w.daysRemaining <= 1) purchaseDate = iso;
    }
    expect(purchaseDate).not.toBe("");
    const target = receipts[0].id;
    await db.update(receiptsTable).set({ purchaseDate, purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", isDraft: false })
      .where(eq(receiptsTable.id, target));
    // Only this fixture receipt "sends"; any other dev row is reported as not sent, which resets its claim.
    fixture.returnEmail.mockReset().mockImplementation(async (uid: string) => uid === userId);
    fixture.push.mockReset().mockImplementation(async (uid: string) => uid === userId);
    await runReturnWindowSweep();
    expect(fixture.returnEmail).toHaveBeenCalledWith(userId, expect.objectContaining({ id: target }));
    expect(fixture.push).toHaveBeenCalledWith(userId, expect.objectContaining({ receiptId: target }));
    // 7-day and 2-day both due in one run: only the 2-day email goes out, and both are marked.
    const targetEmails = fixture.returnEmail.mock.calls.filter(([, r]) => r.id === target);
    expect(targetEmails).toHaveLength(1);
    expect(targetEmails[0][1].daysRemaining).toBeLessThanOrEqual(2);
    const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, target));
    expect(row.returnReminderSent2dAt).not.toBeNull();
    expect(row.returnReminderSent7dAt).not.toBeNull();
    await runReturnWindowSweep();
    expect(fixture.returnEmail.mock.calls.filter(([, r]) => r.id === target)).toHaveLength(1);

    // Warranty reminders also reach a capped (still active) trial, once per expiry date.
    const expiry = new Date(Date.now() + 29 * DAY_MS).toISOString().slice(0, 10);
    await db.update(receiptsTable).set({ warranty: `Manufacturer warranty until ${expiry}` })
      .where(eq(receiptsTable.id, receipts[1].id));
    fixture.warrantyEmail.mockReset().mockImplementation(async (uid: string) => uid === userId);
    await runWarrantyReminderSweep();
    await runWarrantyReminderSweep();
    expect(fixture.warrantyEmail.mock.calls.filter(([uid, r]) => uid === userId && r.id === receipts[1].id)).toHaveLength(1);
  }, 40000);
  it("sends no warranty or return reminders to an expired trial (no current access)", async () => {
    await start();
    const receipt = await upload();
    let purchaseDate = "";
    for (let d = 0; d < 60 && !purchaseDate; d++) {
      const iso = new Date(Date.now() - d * DAY_MS).toISOString().slice(0, 10);
      const w = calcReturnWindow({ purchaseDate: iso, purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR", merchant: "Fixture store" });
      if (w && w.daysRemaining >= 0 && w.daysRemaining <= 1) purchaseDate = iso;
    }
    const expiry = new Date(Date.now() + 29 * DAY_MS).toISOString().slice(0, 10);
    await db.update(receiptsTable).set({ purchaseDate, purchaseCountry: "PT", isOnlinePurchase: true, currency: "EUR",
      isDraft: false, warranty: `Warranty until ${expiry}` }).where(eq(receiptsTable.id, receipt.id));
    await db.update(accountTrialsTable).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(accountTrialsTable.userId, userId));
    expect((await getSubscriptionStatus(userId)).accessState).toBe("trial_expired");
    fixture.returnEmail.mockReset().mockResolvedValue(false);
    fixture.push.mockReset().mockResolvedValue(false);
    fixture.warrantyEmail.mockReset().mockResolvedValue(false);
    await runReturnWindowSweep();
    await runWarrantyReminderSweep();
    const mine = (calls: unknown[][]) => calls.filter(([uid]) => uid === userId);
    expect(mine(fixture.returnEmail.mock.calls)).toHaveLength(0);
    expect(mine(fixture.push.mock.calls)).toHaveLength(0);
    expect(mine(fixture.warrantyEmail.mock.calls)).toHaveLength(0);
    const [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
    expect(row.returnReminderSent2dAt).toBeNull();
    expect(row.warrantyReminderSentFor).toBeNull();
  }, 30000);
  it("retries a rejected warranty reminder on the next run instead of marking it sent", async () => {
    await start();
    const receipt = await upload();
    const expiry = new Date(Date.now() + 28 * DAY_MS).toISOString().slice(0, 10);
    await db.update(receiptsTable).set({ warranty: `Warranty until ${expiry}` }).where(eq(receiptsTable.id, receipt.id));
    fixture.warrantyEmail.mockReset().mockResolvedValue(false);
    await runWarrantyReminderSweep();
    let [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
    expect(row.warrantyReminderSentFor).toBeNull();
    fixture.warrantyEmail.mockReset().mockImplementation(async (uid: string) => uid === userId);
    await runWarrantyReminderSweep();
    [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
    expect(row.warrantyReminderSentFor).toBe(expiry);
    expect(fixture.warrantyEmail.mock.calls.filter(([uid]) => uid === userId)).toHaveLength(1);
  }, 30000);
  it("reminds a realistic manufacturer warranty and the PT legal warranty separately, once each", async () => {
    await start();
    const receipt = await upload();
    const target = new Date(Date.now() + 29 * DAY_MS).toISOString().slice(0, 10);
    const { addMonthsClamped } = await import("../lib/warrantyExpiry");
    // Manufacturer: "2-year" text, bought 24 months before the target end date.
    const purchaseDate = addMonthsClamped(target, -24);
    await db.update(receiptsTable).set({
      purchaseDate, purchaseCountry: "PT", currency: "EUR", category: "Electronics", isDraft: false,
      warranty: "2-year manufacturer warranty",
    }).where(eq(receiptsTable.id, receipt.id));
    fixture.warrantyEmail.mockReset().mockImplementation(async (uid: string) => uid === userId);
    await runWarrantyReminderSweep();
    await runWarrantyReminderSweep();
    let calls = fixture.warrantyEmail.mock.calls.filter(([uid, r]) => uid === userId && r.id === receipt.id);
    if (addMonthsClamped(purchaseDate, 24) === target) {
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({ kind: "manufacturer", expiresOn: target });
    }
    let [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
    expect(row.manufacturerWarrantyExpiresOn).toBe(addMonthsClamped(purchaseDate, 24));
    expect(row.legalWarrantyExpiresOn).toBe(addMonthsClamped(purchaseDate, 36));

    // Legal: bought 3 years before the target end date, no manufacturer text.
    const legalPurchase = addMonthsClamped(target, -36);
    await db.update(receiptsTable).set({ purchaseDate: legalPurchase, warranty: null })
      .where(eq(receiptsTable.id, receipt.id));
    fixture.warrantyEmail.mockReset().mockImplementation(async (uid: string) => uid === userId);
    await runWarrantyReminderSweep();
    await runWarrantyReminderSweep();
    calls = fixture.warrantyEmail.mock.calls.filter(([uid, r]) => uid === userId && r.id === receipt.id);
    if (addMonthsClamped(legalPurchase, 36) === target) {
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({ kind: "legal", expiresOn: target });
      [row] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
      expect(row.legalWarrantyReminderSentFor).toBe(target);
    }
  }, 30000);
  it("reminds a warranty that ends in less than 28 days (added late), once, and never a past one", async () => {
    await start();
    const receipt = await upload();
    const soon = new Date(Date.now() + 5 * DAY_MS).toISOString().slice(0, 10);
    await db.update(receiptsTable).set({ warranty: `Warranty until ${soon}`, isDraft: false })
      .where(eq(receiptsTable.id, receipt.id));
    fixture.warrantyEmail.mockReset().mockImplementation(async (uid: string) => uid === userId);
    await runWarrantyReminderSweep();
    await runWarrantyReminderSweep();
    expect(fixture.warrantyEmail.mock.calls.filter(([uid, r]) => uid === userId && r.id === receipt.id)).toHaveLength(1);
    const past = new Date(Date.now() - 2 * DAY_MS).toISOString().slice(0, 10);
    await db.update(receiptsTable).set({ warranty: `Warranty until ${past}`, warrantyReminderSentFor: null })
      .where(eq(receiptsTable.id, receipt.id));
    fixture.warrantyEmail.mockReset().mockImplementation(async (uid: string) => uid === userId);
    await runWarrantyReminderSweep();
    expect(fixture.warrantyEmail.mock.calls.filter(([uid, r]) => uid === userId && r.id === receipt.id)).toHaveLength(0);
  }, 30000);
  it("lets the daily sweep run only once per ~23h across restarts/instances", async () => {
    const job = `test-job-${randomUUID()}`;
    const t0 = new Date("2026-10-26T03:00:00Z");
    try {
      const first = await Promise.all([claimScheduledRun(job, 23 * 3600_000, t0), claimScheduledRun(job, 23 * 3600_000, t0)]);
      expect(first.filter(Boolean)).toHaveLength(1);
      expect(await claimScheduledRun(job, 23 * 3600_000, new Date(t0.getTime() + 3600_000))).toBe(false);
      expect(await claimScheduledRun(job, 23 * 3600_000, new Date(t0.getTime() + 23 * 3600_000))).toBe(true);
    } finally {
      await db.delete(scheduledJobRunsTable).where(eq(scheduledJobRunsTable.job, job));
    }
  });
  it("extends existing 7-day trials to 15 days from their original start (idempotent)", async () => {
    await start();
    const startedAt = new Date(Date.now() - 10 * DAY_MS); // old 7-day trial already expired on day 7
    await db.update(accountTrialsTable).set({ startedAt, endsAt: new Date(startedAt.getTime() + 7 * DAY_MS) })
      .where(eq(accountTrialsTable.userId, userId));
    expect((await getSubscriptionStatus(userId)).accessState).toBe("trial_expired");
    await extendTrialsToCurrentDuration();
    await extendTrialsToCurrentDuration();
    const [row] = await db.select().from(accountTrialsTable).where(eq(accountTrialsTable.userId, userId));
    expect(row.endsAt.getTime() - row.startedAt.getTime()).toBe(TRIAL_DURATION_MS);
    expect(await getSubscriptionStatus(userId)).toMatchObject({ accessState: "account_trial", canUseApp: true, canUpload: true });
  });
  it("caps AI reads at 10 per trial (uploads + email), counting discarded reads, never for paid users", async () => {
    expect(TRIAL_AI_READ_LIMIT).toBe(10);
    await start();
    fixture.check.mockResolvedValueOnce(false);
    await upload(); // not a receipt: slot released, but the AI read is used
    expect(await countTrialAiReads(userId)).toBe(1);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(0);
    // Email imports share the same budget.
    for (let i = 1; i < TRIAL_AI_READ_LIMIT; i++) expect(await claimTrialAiRead(userId, "email", `m${i}`)).toBe(true);
    expect(await claimTrialAiRead(userId, "email", "one-too-many")).toBe(false);
    expect(await countTrialAiReads(userId)).toBe(TRIAL_AI_READ_LIMIT);
    const refused = await url();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "trial_ai_reads_exhausted", message: TRIAL_AI_READS_MESSAGE });
    const calls = fixture.extraction.mock.calls.length + fixture.check.mock.calls.length;
    // A raced upload past the cap is not sent to the AI.
    await db.execute(sql`DELETE FROM trial_ai_reads WHERE user_id = ${userId} AND ref = 'm9'`);
    const issuance = await url();
    expect(issuance.status).toBe(200);
    const { objectPath } = await issuance.json();
    await claimTrialAiRead(userId, "email", "raced");
    const created = await request("/receipts", { objectPath, originalFileName: "late.pdf", contentType: "application/pdf" });
    expect(created.status).toBe(201);
    const { id } = await created.json();
    await expect.poll(async () => (await db.select().from(receiptsTable).where(eq(receiptsTable.id, id)))[0].status,
      { timeout: 8000 }).toBe("failed");
    expect(fixture.extraction.mock.calls.length + fixture.check.mock.calls.length).toBe(calls);
  }, 20000);
  it("counts an upload only once it is saved; discarded drafts and scan attempts never count", async () => {
    await start();
    const draft = await uploadDraft();
    // Extracted but not saved: holds a slot, does not count as used.
    expect(await getSubscriptionStatus(userId)).toMatchObject({ trialUploadsUsed: 0, trialUploadsRemaining: TRIAL_LIMIT - 1 });
    // Retake/discard frees the slot.
    expect((await request(`/receipts/${draft.id}`, undefined, "DELETE")).status).toBe(204);
    expect(await getSubscriptionStatus(userId)).toMatchObject({ trialUploadsUsed: 0, trialUploadsRemaining: TRIAL_LIMIT });
    // Saving makes it count; deleting a saved receipt never restores the use.
    const saved = await uploadDraft();
    expect((await request(`/receipts/${saved.id}`, { isDraft: false, merchant: "Saved" }, "PATCH")).status).toBe(200);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(1);
    expect((await request(`/receipts/${saved.id}`, { isDraft: false, merchant: "Edited again" }, "PATCH")).status).toBe(200);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(1);
    expect((await request(`/receipts/${saved.id}`, undefined, "DELETE")).status).toBe(204);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(1);
    // An abandoned draft stops holding its slot after 24 h, and saving it later
    // is refused once the other slots were used.
    const stale = await uploadDraft();
    await db.update(trialUploadsTable).set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(trialUploadsTable.objectPath, stale.objectPath));
    for (let i = 1; i < TRIAL_LIMIT; i++) await upload();
    expect((await getSubscriptionStatus(userId)).accessState).toBe("trial_exhausted");
    const late = await request(`/receipts/${stale.id}`, { isDraft: false }, "PATCH");
    expect(late.status).toBe(403);
    expect((await late.json()).message).toBe(TRIAL_CAP_MESSAGE);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(TRIAL_LIMIT);
  }, 30000);
  it("migrates drafts counted under the old rule so they count only when saved", async () => {
    await start();
    const draft = await uploadDraft();
    await db.update(trialUploadsTable).set({ state: "succeeded" }).where(eq(trialUploadsTable.objectPath, draft.objectPath));
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(1);
    await uncountUnsavedTrialDrafts();
    await uncountUnsavedTrialDrafts();
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(0);
    expect((await request(`/receipts/${draft.id}`, { isDraft: false }, "PATCH")).status).toBe(200);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(1);
  });
  it("reserves at most five slots with concurrent requests from multiple devices", async () => {
    await start();
    const responses = await Promise.all(Array.from({ length: 8 }, () => url()));
    expect(responses.filter(r => r.status === 200)).toHaveLength(TRIAL_LIMIT);
    expect(responses.filter(r => r.status === 403)).toHaveLength(8 - TRIAL_LIMIT);
    expect((await getSubscriptionStatus(userId)).trialUploadsRemaining).toBe(0);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(0);
  });
  it("releases non-receipts and final processing failures, without counting retries twice", async () => {
    await start();
    fixture.check.mockResolvedValueOnce(false);
    await upload();
    expect((await getSubscriptionStatus(userId)).trialUploadsRemaining).toBe(TRIAL_LIMIT);
    fixture.extraction.mockRejectedValue(new Error("Fixture transfer failed"));
    const failed = await upload();
    expect((await getSubscriptionStatus(userId)).trialUploadsRemaining).toBe(TRIAL_LIMIT);
    expect((await request(`/receipts/${failed.id}`, { isDraft: false, merchant: "Manual receipt" }, "PATCH")).status).toBe(200);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(1);
    fixture.extraction.mockResolvedValue(extractionData);
    const receipt = await upload();
    const duplicate = await request("/receipts", {
      objectPath: receipt.objectPath, originalFileName: "retry.pdf", contentType: "application/pdf",
    });
    expect(duplicate.status).toBe(403);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(2);
  }, 15000);
  it("releases abandoned transfers after expiry and refuses expired or reused paths", async () => {
    await start();
    const { objectPath } = await (await url()).json();
    const past = new Date(Date.now() - 1000);
    await db.update(uploadIntentsTable).set({ expiresAt: past }).where(eq(uploadIntentsTable.objectPath, objectPath));
    await db.update(trialUploadsTable).set({ expiresAt: past }).where(eq(trialUploadsTable.objectPath, objectPath));
    expect((await getSubscriptionStatus(userId)).trialUploadsRemaining).toBe(TRIAL_LIMIT);
    expect((await request("/receipts", { objectPath, originalFileName: "old.pdf", contentType: "application/pdf" })).status).toBe(403);
  });
  it("releases failed transfers immediately but cannot release successful receipts", async () => {
    await start();
    const { objectPath } = await (await url()).json();
    expect((await getSubscriptionStatus(userId)).trialUploadsRemaining).toBe(TRIAL_LIMIT - 1);
    expect((await request("/storage/uploads/release", { objectPath })).status).toBe(204);
    expect((await getSubscriptionStatus(userId)).trialUploadsRemaining).toBe(TRIAL_LIMIT);
    expect((await request("/receipts", { objectPath, originalFileName: "released.pdf", contentType: "application/pdf" })).status).toBe(403);
    const receipt = await upload();
    expect((await request("/storage/uploads/release", { objectPath: receipt.objectPath })).status).toBe(204);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(1);
  });
  it("binds attachments to an owned receipt and forbids using them as extra receipts", async () => {
    await start();
    const receipt = await upload();
    const issuance = await request("/storage/uploads/request-url", {
      receiptId: receipt.id, name: "attachment.pdf", size: 10, contentType: "application/pdf",
    });
    expect(issuance.status).toBe(200);
    const { objectPath } = await issuance.json();
    expect((await getSubscriptionStatus(userId)).trialUploadsRemaining).toBe(TRIAL_LIMIT - 1);
    const input = { objectPath, originalFileName: "attachment.pdf", contentType: "application/pdf" };
    expect((await request(`/receipts/${receipt.id}/attachments`, input)).status).toBe(201);
    expect((await request("/receipts", input)).status).toBe(403);
    await db.update(accountTrialsTable).set({ endsAt: new Date(0) }).where(eq(accountTrialsTable.userId, userId));
    expect((await request("/storage/uploads/request-url", {
      receiptId: receipt.id, name: "blocked.pdf", size: 10, contentType: "application/pdf",
    })).status).toBe(403);
  });
  it("counts Gmail approval with camera/file uploads and limits simultaneous approvals", async () => {
    await start();
    await upload();
    const imports = await db.insert(pendingImportsTable).values(Array.from({ length: TRIAL_LIMIT + 1 }, (_, i) => ({
      userId, gmailMessageId: randomUUID(), objectPath: `/objects/uploads/gmail-${randomUUID()}`,
      originalFileName: `gmail-${i}.pdf`, extractionData,
    }))).returning();
    const responses = await Promise.all(imports.map(i => request(`/gmail/pending/${i.id}/approve`, {})));
    expect(responses.filter(r => r.status === 200)).toHaveLength(TRIAL_LIMIT - 1);
    const refused = responses.filter(r => r.status === 403);
    expect(refused).toHaveLength(2);
    for (const r of refused) expect((await r.json()).message).toBe(TRIAL_CAP_MESSAGE);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(TRIAL_LIMIT);
  });
  it("counts guest migration and preserves guest data when the remaining allowance is insufficient", async () => {
    await start();
    await upload();
    const token = randomUUID();
    guestTokens.push(token); users.push(token);
    await db.insert(guestSessionsTable).values({ token });
    await db.insert(receiptsTable).values(Array.from({ length: TRIAL_LIMIT }, () => ({
      userId: token, objectPath: `/objects/uploads/guest-${randomUUID()}`,
      originalFileName: "guest.pdf", contentType: "application/pdf", status: "completed",
    })));
    expect((await request("/guest-session/claim", { guestToken: token })).status).toBe(403);
    expect(await db.select().from(receiptsTable).where(eq(receiptsTable.userId, token))).toHaveLength(TRIAL_LIMIT);
    const [remove] = await db.select().from(receiptsTable).where(eq(receiptsTable.userId, token));
    await db.delete(receiptsTable).where(eq(receiptsTable.id, remove.id));
    expect((await request("/guest-session/claim", { guestToken: token })).status).toBe(204);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(TRIAL_LIMIT);
    expect((await request("/guest-session/claim", { guestToken: token })).status).toBe(204);
    expect((await getSubscriptionStatus(userId)).trialUploadsUsed).toBe(TRIAL_LIMIT);
  });
  it("protects both founding prices through abandoned checkout, cancellation and resubscription", async () => {
    await start();
    vi.stubEnv("STRIPE_TEST_MONTHLY_PRICE_ID", "price_monthly_changed");
    vi.stubEnv("STRIPE_TEST_YEARLY_PRICE_ID", "price_yearly_changed");
    for (const planType of ["monthly", "yearly"]) {
      expect((await request("/billing/create-checkout-session", { planType })).status).toBe(200);
      expect(fixture.checkout).toHaveBeenLastCalledWith(expect.objectContaining({
        line_items: [{ price: `price_${planType}_original`, quantity: 1 }],
        subscription_data: { metadata: { userId, offer: "founding_customer" } },
      }));
    }
    // A checkout redirect/cancellation never grants access or resets quota.
    expect((await getSubscriptionStatus(userId)).accessState).toBe("account_trial");
    fixture.checkout.mockRejectedValueOnce(new Error("Fixture checkout unavailable"));
    expect((await request("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(500);
    expect((await getSubscriptionStatus(userId))).toMatchObject({
      accessState: "account_trial", foundingEligible: true, trialUploadsRemaining: TRIAL_LIMIT,
    });
    fixture.liveSubscriptions = [{ status: "active" }];
    expect((await request("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(409);
    fixture.liveSubscriptions = [{ status: "trialing" }];
    expect((await request("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(409);
    fixture.liveSubscriptions = [{ status: "canceled" }];
    expect((await request("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(200);
    expect(fixture.checkout).toHaveBeenLastCalledWith(expect.objectContaining({
      line_items: [{ price: "price_monthly_original", quantity: 1 }],
    }));
  });
});
