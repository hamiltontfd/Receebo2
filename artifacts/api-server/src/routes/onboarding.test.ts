import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, receiptsTable, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-session"] ?? null }),
  clerkClient: { users: { getUser: async (id: string) => ({
    id, emailAddresses: [], firstName: null, lastName: null, createdAt: null,
  }) } },
}));
vi.mock("../lib/legalAcceptance", () => ({
  hasCurrentLegalAcceptance: async (id: string) => id !== "no-consent-fixture",
  TERMS_VERSION: "unchanged", PRIVACY_VERSION: "unchanged",
}));
vi.mock("../lib/accountDeletionState", () => ({
  isAccountDeletionInProgress: async (id: string) => id === "deleting-fixture",
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    async deleteObject() {}
  }, ObjectNotFoundError: class extends Error {}, objectStorageClient: {},
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, accessState: "paid" }),
  receiptCapReached: () => false,
}));
import account from "./account";
import receipts from "./receipts";

const users = Array.from({ length: 6 }, () => `onboarding-fixture-${randomUUID()}`);
const [A, B, C, D, E, F] = users;
let server: Server;
let base: string;
const blank = { receiptDone: false, searchDone: false, completed: false, dismissed: false };
beforeAll(async () => {
  const app = express();
  app.use(express.json(), account, receipts);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  for (const user of users) {
    await db.delete(receiptsTable).where(eq(receiptsTable.userId, user));
    await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, user));
  }
});
function call(user: string | null, body?: unknown, expected?: string) {
  return fetch(`${base}/account/onboarding`, {
    method: body === undefined ? "GET" : "PATCH",
    headers: { "Content-Type": "application/json",
      ...(user ? { "x-test-session": user } : {}),
      ...(expected ? { "X-Onboarding-Account": expected } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function receipt(userId: string, isDraft = false) {
  const [row] = await db.insert(receiptsTable).values({
    userId, objectPath: `/objects/${randomUUID()}`, originalFileName: "test.pdf",
    contentType: "application/pdf", status: "completed", isDraft,
  }).returning();
  return row;
}
describe("durable account onboarding over independent HTTP requests and real DB locks", () => {
  it("requires authentication and existing legal/deletion checks; rejects bad and forged fields", async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call("deleting-fixture", { dismissed: true })).status).toBe(423);
    expect((await call("no-consent-fixture")).status).toBe(428);
    for (const body of [{ completed: true }, { receiptDone: true }, { userId: B }, { searchDone: "true" }, null, []]) {
      expect((await call(A, body)).status).toBe(400);
    }
    expect((await call(B, { dismissed: true }, A)).status).toBe(409);
    expect((await call(B, undefined, A)).status).toBe(409);
    expect(await (await call(A)).json()).toEqual(blank);
  });
  it("persists both steps immediately across clients; deletion cannot reopen completed onboarding", async () => {
    await receipt(A);
    const firstClient = await (await call(A)).json();
    expect(firstClient).toEqual({ ...blank, receiptDone: true });
    const write = await call(A, { searchDone: true });
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ ...blank, receiptDone: true, searchDone: true, completed: true });
    await db.delete(receiptsTable).where(eq(receiptsTable.userId, A));
    // No cookie/localStorage/cache shared with the first client.
    expect(await (await call(A)).json()).toEqual({ ...blank, receiptDone: true, searchDone: true, completed: true });
    expect(await (await call(B)).json()).toEqual(blank);
    expect((await call(A)).headers.get("cache-control")).toBe("no-store");
  });
  it("persists explicit dismissal independently of completion and keeps other preferences intact", async () => {
    await db.insert(userPreferencesTable).values({
      userId: C, market: "BR", language: "pt-BR", notificationsOptOut: true,
    });
    expect(await (await call(C, { dismissed: true })).json()).toEqual({ ...blank, dismissed: true });
    expect(await (await call(C)).json()).toEqual({ ...blank, dismissed: true });
    const [prefs] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, C));
    expect(prefs).toMatchObject({ market: "BR", language: "pt-BR", notificationsOptOut: true });
  });
  it("serializes concurrent and stale updates without reverting any confirmed field", async () => {
    await receipt(D);
    const responses = await Promise.all([
      call(D, { searchDone: true }), call(D, { dismissed: true }),
      call(D, { searchDone: false, dismissed: false }), call(D, {}),
    ]);
    expect(responses.every(r => r.status === 200)).toBe(true);
    await call(D, { searchDone: false, dismissed: false });
    expect(await (await call(D)).json()).toEqual({
      receiptDone: true, searchDone: true, completed: true, dismissed: true,
    });
  });
  it("recovers only attributable receipt evidence, not drafts or assumed search", async () => {
    await receipt(E, true);
    expect(await (await call(E)).json()).toEqual(blank);
    const row = await receipt(E);
    // Deletion before any onboarding read must still remember step one.
    const deleted = await fetch(`${base}/receipts/${row.id}`, {
      method: "DELETE", headers: { "x-test-session": E },
    });
    expect(deleted.status).toBe(204);
    expect(await (await call(E)).json()).toEqual({ ...blank, receiptDone: true });
  });
  it("finishes when receipt evidence arrives after a retried search write", async () => {
    expect(await (await call(F, { searchDone: true })).json()).toEqual({ ...blank, searchDone: true });
    await receipt(F);
    const complete = await (await call(F)).json();
    expect(complete).toMatchObject({ receiptDone: true, searchDone: true, completed: true });
    await call(F, {});
    expect(await (await call(F)).json()).toEqual(complete);
  });
  it("fails reads and writes explicitly and allows a safe retry", async () => {
    const failingRead = vi.spyOn(db, "select").mockImplementationOnce(() => { throw new Error("read unavailable"); });
    try {
      expect((await call(B)).status).toBe(500);
    } finally { failingRead.mockRestore(); }
    const failingWrite = vi.spyOn(db, "insert").mockImplementationOnce(() => { throw new Error("write unavailable"); });
    try {
      expect((await call(B, { dismissed: true })).status).toBe(500);
    } finally { failingWrite.mockRestore(); }
    expect(await (await call(B)).json()).toEqual(blank);
    expect(await (await call(B, { dismissed: true })).json()).toEqual({ ...blank, dismissed: true });
  });
  it("includes onboarding in the existing preferences export without inventing legal acceptance", async () => {
    const response = await fetch(`${base}/account/export`, { headers: { "x-test-session": C } });
    expect(response.status).toBe(200);
    const exported = await response.json();
    expect(exported.preferences).toMatchObject({
      onboardingDismissed: true, onboardingCompleted: false, language: "pt-BR", notificationsOptOut: true,
    });
    expect(exported.legalAcceptances).toEqual([]);
  });
});
