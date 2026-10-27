import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic configuration only: never contacts Microsoft, Google, storage or
// the database.
const state = vi.hoisted(() => ({
  limitQueue: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    revokeToken = vi.fn().mockResolvedValue(undefined);
    setCredentials() {}
    generateAuthUrl({ state }: { state: string }) {
      return `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(state)}`;
    }
  },
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, canUpload: true }),
}));
vi.mock("@workspace/db", () => {
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    from: () => query, where: () => query, orderBy: () => query,
    limit: async () => state.limitQueue.shift() ?? [],
    set: (values: Record<string, unknown>) => { state.updates.push(values); return query; },
    values: (values: Record<string, unknown>) => { state.inserts.push(values); return query; },
    onConflictDoNothing: () => query, onConflictDoUpdate: () => query,
    returning: async () => [],
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve([])),
  });
  return {
    gmailConnectionsTable: {}, emailConnectionsTable: {}, pendingImportsTable: {},
    receiptsTable: {}, gmailSeenMessagesTable: {}, trialUploadsTable: {},
    db: { select: () => query, delete: () => query, update: () => query, insert: () => query },
  };
});
vi.mock("../lib/tokenCrypto", () => ({
  decryptToken: (plaintext: string) => ({ plaintext }),
  encryptToken: (token: string) => `enc(${token})`,
  hasTokenEncryptionKey: () => true,
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class { deleteObject = vi.fn(); },
  objectStorageClient: {},
}));
vi.mock("../lib/receiptExtraction", () => ({
  extractReceiptData: vi.fn(), extractReceiptDataFromText: vi.fn(),
  precheckEmailIsReceipt: vi.fn(async () => true),
}));
vi.mock("../lib/accountDeletionState", () => ({
  isAccountDeletionInProgress: async () => false,
}));
vi.mock("../lib/userDataLock", () => ({
  withUserDataLock: (_user: string, action: () => unknown) => action(),
  lockUserDataMutation: (handler: unknown) => handler,
  tryLockUserDataMutation: (handler: unknown) => handler,
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.userId = "synthetic-user";
    next();
  },
}));
vi.mock("../lib/legalAcceptance", () => ({
  requireCurrentLegalAcceptance: (_req: any, _res: any, next: () => void) => next(),
}));

import gmail from "./gmail";
import outlook from "./outlook";
import mail from "./mail";

let server: Server;
let base: string;

beforeAll(async () => {
  vi.stubEnv("SESSION_SECRET", "synthetic-signing-key");
  const app = express();
  app.use("/api", gmail, outlook, mail);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  state.limitQueue.length = 0;
  state.updates.length = 0;
  state.inserts.length = 0;
  vi.stubEnv("MAIL_PROVIDERS_ENABLED", undefined);
  vi.stubEnv("GOOGLE_CLIENT_ID", "synthetic-google-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic-google-secret");
  vi.stubEnv("MICROSOFT_CLIENT_ID", undefined);
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", undefined);
  vi.unstubAllGlobals();
});

function configureOutlook() {
  vi.stubEnv("MICROSOFT_CLIENT_ID", "synthetic-ms-id");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "SYNTHETIC-ms-secret");
}

describe("Gmail hidden by default (MAIL_PROVIDERS_ENABLED unset)", () => {
  it.each([
    ["GET", "/gmail/connect"],
    ["GET", "/gmail/connect-url"],
    ["GET", "/gmail/callback?code=x&state=y"],
    ["POST", "/gmail/sync"],
  ])("%s %s answers 404", async (method, path) => {
    const res = await fetch(`${base}${path}`, { method, redirect: "manual" });
    expect(res.status).toBe(404);
  });

  it("still lets an existing Gmail connection be disconnected", async () => {
    state.limitQueue.push([{ userId: "synthetic-user", refreshToken: "rt", accessToken: null }]);
    const res = await fetch(`${base}/gmail/disconnect`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disconnected: true });
  });

  it("re-enables Gmail when listed in the flag", async () => {
    vi.stubEnv("MAIL_PROVIDERS_ENABLED", "gmail,outlook");
    const res = await fetch(`${base}/gmail/connect-url`);
    expect(res.status).toBe(200);
    expect(new URL((await res.json()).url).origin).toBe("https://accounts.google.com");
  });

  it("/mail/status hides Gmail unless the user is still connected to it", async () => {
    state.limitQueue.push([], []); // no gmail, no outlook connection
    let body = await (await fetch(`${base}/mail/status`)).json();
    expect(body.providers).toEqual([]);
    expect(body.enabledProviders).toEqual(["outlook"]);

    state.limitQueue.push([{ gmailEmail: "me@gmail.com", lastSyncedAt: null, status: "active" }], []);
    body = await (await fetch(`${base}/mail/status`)).json();
    expect(body.providers).toEqual([
      expect.objectContaining({ id: "gmail", enabled: false, connected: true }),
    ]);
  });
});

describe("GET /mail/providers (public copy source)", () => {
  it("lists only enabled and configured providers, without user data", async () => {
    let res = await fetch(`${base}/mail/providers`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: [] }); // Outlook enabled but not configured

    configureOutlook();
    res = await fetch(`${base}/mail/providers`);
    expect(await res.json()).toEqual({ providers: [{ id: "outlook", label: "Outlook" }] });

    vi.stubEnv("MAIL_PROVIDERS_ENABLED", "gmail,outlook");
    res = await fetch(`${base}/mail/providers`);
    expect(await res.json()).toEqual({
      providers: [
        { id: "gmail", label: "Gmail" },
        { id: "outlook", label: "Outlook" },
      ],
    });
  });
});

describe("Outlook routes", () => {
  it("are inert when Microsoft credentials are missing", async () => {
    expect((await fetch(`${base}/outlook/connect-url`)).status).toBe(503);
    expect((await fetch(`${base}/outlook/callback?code=x&state=y`, { redirect: "manual" })).status).toBe(404);
    expect((await fetch(`${base}/outlook/sync`, { method: "POST" })).status).toBe(404);
    state.limitQueue.push([]);
    const status = await (await fetch(`${base}/outlook/status`)).json();
    expect(status).toMatchObject({ enabled: true, configured: false, connected: false });
  });

  it("are hidden when Outlook is not in the flag", async () => {
    configureOutlook();
    vi.stubEnv("MAIL_PROVIDERS_ENABLED", "gmail");
    expect((await fetch(`${base}/outlook/connect-url`)).status).toBe(404);
  });

  it("return a Microsoft sign-in URL with a signed, provider-bound state", async () => {
    configureOutlook();
    const res = await fetch(`${base}/outlook/connect-url`);
    expect(res.status).toBe(200);
    const url = new URL((await res.json()).url);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    const outlookState = url.searchParams.get("state")!;

    // A Gmail callback must not accept an Outlook state.
    vi.stubEnv("MAIL_PROVIDERS_ENABLED", "gmail,outlook");
    const gmailCallback = await fetch(
      `${base}/gmail/callback?code=x&state=${encodeURIComponent(outlookState)}`,
      { redirect: "manual" },
    );
    expect(gmailCallback.headers.get("location")).toContain("gmail=error");
  });

  it("marks the connection needs_reconnect on invalid_grant and answers 409", async () => {
    configureOutlook();
    state.limitQueue.push([{
      id: 7, userId: "synthetic-user", provider: "outlook", refreshToken: "RT",
      accessToken: null, tokenExpiry: null, status: "active",
    }]);
    const realFetch = globalThis.fetch;
    const microsoft = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: "invalid_grant", error_description: "SYNTHETIC" }),
    });
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://login.microsoftonline.com/")
        ? microsoft(input, init)
        : realFetch(input, init));
    try {
      const res = await realFetch(`${base}/outlook/sync`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "needs_reconnect", provider: "outlook" });
      expect(microsoft).toHaveBeenCalledOnce();
      expect(state.updates).toContainEqual(
        expect.objectContaining({ status: "needs_reconnect", lastError: "invalid_grant" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rotates and stores the new refresh token on a successful refresh", async () => {
    configureOutlook();
    state.limitQueue.push([{
      id: 7, userId: "synthetic-user", provider: "outlook", refreshToken: "RT1",
      accessToken: null, tokenExpiry: null, status: "active",
    }]);
    const realFetch = globalThis.fetch;
    const remote = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://login.microsoftonline.com/")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }) };
      }
      // Graph listing: empty mailbox
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ value: [] }) };
    });
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      /^https:\/\/(login\.microsoftonline|graph\.microsoft)\.com\//.test(String(input))
        ? remote(input)
        : realFetch(input, init));
    try {
      const res = await realFetch(`${base}/outlook/sync`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ checked: 0, queued: 0 });
      expect(state.updates).toContainEqual(expect.objectContaining({
        accessToken: "enc(AT2)", refreshToken: "enc(RT2)", status: "active",
      }));
      expect(String(remote.mock.calls[1]![0])).toContain("https://graph.microsoft.com/v1.0/me/messages?");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
