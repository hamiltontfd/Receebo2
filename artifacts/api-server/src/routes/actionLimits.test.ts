import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { actionKey } from "../lib/actionRateLimit";

const fixture = vi.hoisted(() => ({
  gmail: vi.fn(async () => ({ checked: 1, queued: 0 })),
  outlook: vi.fn(async () => ({ checked: 1, queued: 0 })),
  upload: vi.fn(),
  lock: vi.fn(),
}));
// Only this HTTP test harness recognizes x-test-user. Real identity selection,
// guest lookup, database counters, route ordering and queries remain in use.
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-user"] ?? null }),
}));
vi.mock("../lib/legalAcceptance", () => ({
  hasCurrentLegalAcceptance: async () => true,
  requireCurrentLegalAcceptance: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/accountDeletionState", () => ({ isAccountDeletionInProgress: async () => false }));
vi.mock("../lib/userDataLock", () => ({
  lockUserDataMutation: (handler: any) => (req: any, res: any) => { fixture.lock(); return handler(req, res); },
  tryLockUserDataMutation: (handler: unknown) => handler,
  withUserDataLock: (_id: string, work: () => unknown) => work(),
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, canUpload: true, accessState: "paid" }),
  receiptCapReached: () => false,
}));
vi.mock("../lib/gmailSync", () => ({
  syncUserGmail: fixture.gmail, isGmailConfigured: () => true,
  buildGmailOAuthUrl: vi.fn(), exchangeCodeAndStore: vi.fn(), revokeGmailAccess: vi.fn(),
}));
vi.mock("../lib/outlookSync", () => ({
  syncUserOutlook: fixture.outlook, isOutlookConfigured: () => true,
  getOutlookConnection: async () => ({ status: "active" }),
  deleteOutlookConnection: vi.fn(), exchangeOutlookCodeAndStore: vi.fn(),
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityUploadURL = fixture.upload;
    normalizeObjectEntityPath(url: string) { return new URL(url).pathname; }
  },
  ObjectNotFoundError: class extends Error {}, objectStorageClient: {},
}));
vi.mock("../lib/extractionQueue", () => ({ enqueueExtraction: vi.fn() }));
import storage from "./storage";
import receipts from "./receipts";
import mail from "./mail";
import gmail from "./gmail";
import outlook from "./outlook";

let server: Server;
let base: string;
let user: string;
let other: string;
let guest: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), storage, receipts, mail, gmail, outlook);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  vi.clearAllMocks();
  user = `action-user-${randomUUID()}`;
  other = `action-user-${randomUUID()}`;
  guest = randomUUID();
  vi.stubEnv("MAIL_PROVIDERS_ENABLED", "gmail,outlook");
  vi.stubEnv("ACTION_UPLOAD_PER_MINUTE", "1");
  vi.stubEnv("ACTION_RECEIPT_READS_PER_MINUTE", "2");
  vi.stubEnv("ACTION_MAIL_SYNC_PER_MINUTE", "1");
  fixture.upload.mockImplementation(async () => `https://upload.invalid/objects/${randomUUID()}`);
  await pool.query("INSERT INTO guest_sessions (token) VALUES ($1)", [guest]);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  const identities = [user, other, guest];
  await pool.query("DELETE FROM upload_intents WHERE user_id = ANY($1::text[])", [identities]);
  await pool.query("DELETE FROM guest_sessions WHERE token=$1", [guest]);
  const keys = identities.flatMap(id => (["upload", "receipt-read", "mail-sync"] as const).map(a => actionKey(a, id)));
  await pool.query("DELETE FROM action_rate_limits WHERE key = ANY($1::text[])", [keys]);
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
function call(path: string, id = user, body?: object, extra: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(id ? { "x-test-user": id } : {}), "Content-Type": "application/json", ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
}
const uploadBody = { name: "test.pdf", size: 100, contentType: "application/pdf" };

describe("action limits on real route entry points", () => {
  it("shares one manual-sync budget across aliases, independent of forwarded or guest headers", async () => {
    expect((await call("/gmail/sync", user, {})).status).toBe(200);
    for (const path of ["/outlook/sync", "/mail/sync"]) {
      const blocked = await call(path, user, {}, {
        "x-guest-id": guest, "x-forwarded-for": randomUUID(), "x-real-ip": "8.8.8.8",
      });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(await blocked.json()).toMatchObject({ code: "ACTION_RATE_LIMITED", action: "mail-sync" });
    }
    expect(fixture.gmail).toHaveBeenCalledOnce();
    expect(fixture.outlook).not.toHaveBeenCalled();
    expect((await call("/mail/sync", other, {})).status).toBe(200);
    expect(fixture.outlook).toHaveBeenCalledWith(other);
  });
  it("blocks upload before lock, URL creation or reservation, and rejects guest tokens", async () => {
    expect((await call("/storage/uploads/request-url", user, uploadBody)).status).toBe(200);
    const blocked = await call("/storage/uploads/request-url", user, uploadBody, { "x-guest-id": guest });
    expect(blocked.status).toBe(429);
    expect(fixture.upload).toHaveBeenCalledOnce();
    expect(fixture.lock).toHaveBeenCalledOnce();
    const intents = await pool.query("SELECT count(*)::int n FROM upload_intents WHERE user_id=$1", [user]);
    expect(intents.rows[0].n).toBe(1);
    const slots = await pool.query("SELECT count(*)::int n FROM trial_uploads WHERE user_id=$1", [user]);
    expect(slots.rows[0].n).toBe(0);
    // Guest mode is off: neither an invented nor a registered guest token grants access.
    expect((await call("/storage/uploads/request-url", "", uploadBody, { "x-guest-id": "fake-guest" })).status).toBe(401);
    expect((await call("/storage/uploads/request-url", "", uploadBody, { "x-guest-id": guest })).status).toBe(401);
    expect(fixture.upload).toHaveBeenCalledOnce();
    const guestIntents = await pool.query("SELECT count(*)::int n FROM upload_intents WHERE user_id=$1", [guest]);
    expect(guestIntents.rows[0].n).toBe(0);
  });
  it("shares receipt-read budget across searches, detail, stats and private files", async () => {
    expect((await call("/receipts?q=test")).status).toBe(200);
    expect((await call("/receipts/recent")).status).toBe(200);
    for (const path of ["/receipts/stats", "/receipts/1", "/storage/objects/example", "/receipts/merchant-breakdown", "/receipts/check-similar", "/mail/pending", "/gmail/pending/1"]) {
      const res = await call(path);
      expect(res.status).toBe(429);
      expect((await res.json()).code).toBe("ACTION_RATE_LIMITED");
    }
    expect((await call("/receipts", other)).status).toBe(200);
    expect((await call("/receipts", "", undefined, { "x-guest-id": "invented" })).status).toBe(401);
    expect((await call("/receipts", "", undefined, { "x-guest-id": guest })).status).toBe(401);
  });
  it("returns 503, not quota 429, on counter failure and never starts the action", async () => {
    const original = pool.query.bind(pool);
    const spy = vi.spyOn(pool, "query").mockImplementation((...args: any[]) => {
      const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
      if (text?.includes("INSERT INTO action_rate_limits")) return Promise.reject(new Error("synthetic db outage"));
      return (original as any)(...args);
    });
    const response = await call("/storage/uploads/request-url", user, uploadBody);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect((await response.json()).code).toBe("ACTION_LIMIT_UNAVAILABLE");
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.lock).not.toHaveBeenCalled();
    spy.mockRestore();
    expect((await call("/storage/uploads/request-url", user, uploadBody)).status).toBe(200);
  });
  it("does not apply action budgets to OAuth callbacks or public provider listing", async () => {
    await call("/gmail/sync", user, {});
    expect((await call("/gmail/callback", "")).status).toBe(302);
    expect((await call("/outlook/callback", "")).status).toBe(302);
    expect((await call("/mail/providers", "")).status).toBe(200);
    expect((await call("/gmail/sync", "", {}, { "x-guest-id": guest })).status).toBe(401);
  });
});
