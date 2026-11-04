import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, pool, guestSessionsTable, receiptsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { actionKey } from "../lib/actionRateLimit";

// Only this harness recognizes x-test-user; guest lookup, the claim and the
// database stay real.
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-user"] ?? null }),
}));
vi.mock("../lib/legalAcceptance", () => ({
  hasCurrentLegalAcceptance: async () => true,
  requireCurrentLegalAcceptance: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/accountDeletionState", () => ({ isAccountDeletionInProgress: async () => false }));
vi.mock("../lib/userDataLock", () => ({
  lockUserDataMutation: (handler: any) => handler,
  tryLockUserDataMutation: (handler: unknown) => handler,
  withUserDataLock: (_id: string, work: () => unknown) => work(),
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, canUpload: true, accessState: "paid" }),
  receiptCapReached: () => false,
}));
vi.mock("../lib/extractionQueue", () => ({ enqueueExtraction: vi.fn() }));
import guestSession from "./guestSession";
import receipts from "./receipts";

let server: Server;
let base: string;
const tokens: string[] = [];
const users: string[] = [];
beforeAll(async () => {
  const app = express();
  app.use(express.json(), guestSession, receipts);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  const ids = [...tokens, ...users];
  await db.delete(receiptsTable).where(inArray(receiptsTable.userId, ids));
  await db.delete(guestSessionsTable).where(inArray(guestSessionsTable.token, ids));
  const keys = ids.flatMap(id => (["guest-claim", "receipt-read"] as const).map(a => actionKey(a, id)));
  await pool.query("DELETE FROM action_rate_limits WHERE key = ANY($1::text[])", [keys]);
  tokens.length = 0; users.length = 0;
  vi.unstubAllEnvs();
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

function post(path: string, body: object, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
async function guestWithReceipt(token = randomUUID()) {
  tokens.push(token);
  await db.insert(guestSessionsTable).values({ token });
  await db.insert(receiptsTable).values({
    userId: token, objectPath: `/objects/uploads/guest-${randomUUID()}`,
    originalFileName: "guest.pdf", contentType: "application/pdf", status: "completed",
  });
  return token;
}
const owned = async (id: string) => db.select().from(receiptsTable).where(eq(receiptsTable.userId, id));

describe("guest mode is off on the server", () => {
  it("POST /guest-session answers 410 and creates nothing, even when re-submitting a token", async () => {
    const existing = await guestWithReceipt();
    const insert = vi.spyOn(db, "insert");
    const fresh = await post("/guest-session", {});
    expect(fresh.status).toBe(410);
    expect(await fresh.json()).toMatchObject({ code: "GUEST_MODE_DISABLED" });
    const resubmit = await post("/guest-session", { token: existing });
    expect(resubmit.status).toBe(410);
    expect(JSON.stringify(await resubmit.json())).not.toContain(existing);
    expect(insert).not.toHaveBeenCalled();
    insert.mockRestore();
  });
  it("ignores x-guest-id for registered tokens and legacy guest-* ids, without registering them", async () => {
    const token = await guestWithReceipt();
    const legacy = `guest-${Date.now()}-abc123`;
    tokens.push(legacy);
    await db.insert(receiptsTable).values({
      userId: legacy, objectPath: `/objects/uploads/guest-${randomUUID()}`,
      originalFileName: "legacy.pdf", contentType: "application/pdf", status: "completed",
    });
    for (const id of [token, legacy]) {
      expect((await fetch(`${base}/receipts`, { headers: { "x-guest-id": id } })).status).toBe(401);
      expect((await post("/receipts", { objectPath: "/objects/uploads/x", originalFileName: "x.pdf", contentType: "application/pdf" },
        { "x-guest-id": id })).status).toBe(401);
    }
    const legacyRow = await db.select().from(guestSessionsTable).where(eq(guestSessionsTable.token, legacy));
    expect(legacyRow).toHaveLength(0);
  });
  it("a signed-in user still claims an old guest's receipts exactly once", async () => {
    const token = await guestWithReceipt();
    const user = `noguest-user-${randomUUID()}`; users.push(user);
    expect((await post("/guest-session/claim", { guestToken: token })).status).toBe(401);
    expect((await post("/guest-session/claim", { guestToken: token }, { "x-test-user": user })).status).toBe(204);
    expect(await owned(user)).toHaveLength(1);
    expect(await owned(token)).toHaveLength(0);
    expect(await db.select().from(guestSessionsTable).where(eq(guestSessionsTable.token, token))).toHaveLength(0);
    // Second claim by another account moves nothing.
    const thief = `noguest-user-${randomUUID()}`; users.push(thief);
    expect((await post("/guest-session/claim", { guestToken: token }, { "x-test-user": thief })).status).toBe(204);
    expect(await owned(thief)).toHaveLength(0);
    expect(await owned(user)).toHaveLength(1);
  });
  it("claim only moves receipts of a registered guest token, never another account's", async () => {
    const victim = `noguest-user-${randomUUID()}`; users.push(victim);
    const attacker = `noguest-user-${randomUUID()}`; users.push(attacker);
    const legacy = `guest-${Date.now()}-zzz999`; tokens.push(legacy);
    await db.insert(receiptsTable).values([victim, legacy].map(userId => ({
      userId, objectPath: `/objects/uploads/x-${randomUUID()}`,
      originalFileName: "x.pdf", contentType: "application/pdf", status: "completed",
    })));
    for (const guestToken of [victim, legacy, attacker, "x".repeat(500)]) {
      expect((await post("/guest-session/claim", { guestToken }, { "x-test-user": attacker })).status).toBe(204);
    }
    expect(await owned(attacker)).toHaveLength(0);
    expect(await owned(victim)).toHaveLength(1);
    expect(await owned(legacy)).toHaveLength(1);
  });
  it("rate-limits claim attempts per account", async () => {
    vi.stubEnv("ACTION_GUEST_CLAIM_PER_MINUTE", "2");
    const user = `noguest-user-${randomUUID()}`; users.push(user);
    for (let i = 0; i < 2; i++) {
      expect((await post("/guest-session/claim", { guestToken: randomUUID() }, { "x-test-user": user })).status).toBe(204);
    }
    const blocked = await post("/guest-session/claim", { guestToken: randomUUID() }, { "x-test-user": user });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("ACTION_RATE_LIMITED");
  });
});
