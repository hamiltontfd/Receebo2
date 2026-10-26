import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, canUpload: true }),
}));

const mocks = vi.hoisted(() => ({
  lines: [] as string[],
  getToken: vi.fn(), refreshAccessToken: vi.fn(), revokeToken: vi.fn(),
  fetch: vi.fn(),
  connection: {
    userId: "synthetic-user", refreshToken: "SYNTHETIC-refresh-token",
    accessToken: "SYNTHETIC-access-token", tokenExpiry: null,
  },
}));
vi.mock("../lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/logger")>();
  const { default: pino } = await import("pino");
  return {
    ...actual,
    gmailLogger: actual.createGmailLogger(pino({
      level: "trace",
    }, { write: (line: string) => { mocks.lines.push(line); } })),
  };
});
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    getToken = mocks.getToken;
    refreshAccessToken = mocks.refreshAccessToken;
    revokeToken = mocks.revokeToken;
    setCredentials() {}
    generateAuthUrl({ state }: { state: string }) {
      return `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(state)}`;
    }
  },
}));
vi.mock("@workspace/db", () => {
  const query = {
    from: () => query, where: () => query,
    limit: async () => [mocks.connection],
    set: () => query,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve([])),
  };
  return {
    gmailConnectionsTable: {}, pendingImportsTable: {}, receiptsTable: {},
    gmailSeenMessagesTable: {},
    db: { select: () => query, delete: () => query, update: () => query },
  };
});
vi.mock("../lib/tokenCrypto", () => ({
  decryptToken: (plaintext: string) => ({ plaintext }),
  encryptToken: (token: string) => token,
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {},
  objectStorageClient: {},
}));
vi.mock("../lib/receiptExtraction", () => ({ extractReceiptData: vi.fn() }));
vi.mock("../lib/accountDeletionState", () => ({
  isAccountDeletionInProgress: async () => false,
}));
vi.mock("../lib/userDataLock", () => ({
  withUserDataLock: (_user: string, action: () => unknown) => action(),
  lockUserDataMutation: (handler: unknown) => handler,
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
import { syncUserGmail } from "../lib/gmailSync";

const privateValues = [
  "SYNTHETIC-client-secret", "SYNTHETIC-authorization-code",
  "SYNTHETIC-access-token", "SYNTHETIC-refresh-token",
  "SYNTHETIC-state", "SYNTHETIC-private-email-content",
];
function googleFailure() {
  return Object.assign(new Error(privateValues.join(" ")), {
    config: { data: privateValues.join("&"), headers: { Authorization: privateValues[2] } },
    response: {
      status: 400,
      data: { error: "invalid_grant", error_description: privateValues.join(" ") },
    },
  });
}
function assertSafe(expectedMessage: string, expectedError: object) {
  const log = mocks.lines.join("");
  expect(mocks.lines.map((line) => JSON.parse(line))).toContainEqual(
    expect.objectContaining({ msg: expectedMessage, err: expectedError }),
  );
  for (const value of privateValues) expect(log).not.toContain(value);
}

let server: Server;
let base: string;
beforeAll(async () => {
  // Only synthetic configuration; never contact Google, storage, or the database.
  vi.stubEnv("GOOGLE_CLIENT_ID", "synthetic-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", privateValues[0]!);
  vi.stubEnv("SESSION_SECRET", "synthetic-signing-key");
  // Gmail is hidden by default; these tests exercise the Gmail routes.
  vi.stubEnv("MAIL_PROVIDERS_ENABLED", "gmail");
  const app = express();
  app.use("/api", gmail);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/gmail`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lines.length = 0;
});

describe("Gmail failure logging at route and sync boundaries", () => {
  it("sanitizes callback query errors and invalid state", async () => {
    await fetch(`${base}/callback?error=${privateValues[5]}&code=${privateValues[1]}&state=${privateValues[4]}`, { redirect: "manual" });
    assertSafe("Gmail callback: missing params or OAuth error", { code: "unknown_error" });
    mocks.lines.length = 0;
    await fetch(`${base}/callback?code=${privateValues[1]}&state=${privateValues[4]}`, { redirect: "manual" });
    assertSafe("Gmail callback: invalid or tampered state", { code: "unknown_error" });
  });

  it("preserves a recognized callback error without exposing the code or state", async () => {
    await fetch(`${base}/callback?error=access_denied&code=${privateValues[1]}&state=${privateValues[4]}`, { redirect: "manual" });
    assertSafe("Gmail callback: missing params or OAuth error", { code: "access_denied" });
  });

  it("sanitizes real token-exchange failures after valid state verification", async () => {
    mocks.getToken.mockRejectedValueOnce(googleFailure());
    const connect = await fetch(`${base}/connect`, { redirect: "manual" });
    const state = new URL(connect.headers.get("location")!).searchParams.get("state")!;
    const callback = await fetch(`${base}/callback?${new URLSearchParams({
      code: privateValues[1]!, state,
    })}`, { redirect: "manual" });
    expect(callback.status).toBe(302);
    assertSafe("Gmail callback: token exchange failed", { code: "invalid_grant", status: 400 });
    expect(mocks.lines.join("")).not.toContain(state);
  });

  it("sanitizes token refresh errors from the sync service and its route catch", async () => {
    mocks.refreshAccessToken.mockRejectedValueOnce(googleFailure());
    const response = await fetch(`${base}/sync`, { method: "POST" });
    expect(response.status).toBe(500);
    assertSafe("Gmail sync: token refresh failed", { code: "invalid_grant", status: 400 });
    assertSafe("POST /gmail/sync failed", { code: "unknown_error" });
  });

  it("sanitizes revocation errors while still removing local credentials", async () => {
    mocks.revokeToken.mockRejectedValueOnce(googleFailure());
    const response = await fetch(`${base}/disconnect`, { method: "DELETE" });
    expect(response.status).toBe(200);
    assertSafe("Gmail token revocation failed; removing local credentials", {
      code: "invalid_grant", status: 400,
    });
  });

  it("does not read or log a failing Gmail API response body", async () => {
    mocks.refreshAccessToken.mockResolvedValueOnce({ credentials: { access_token: privateValues[2] } });
    const text = vi.fn().mockResolvedValue(privateValues[5]);
    const cancel = vi.fn().mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 403, text, body: { cancel } });
    vi.stubGlobal("fetch", mocks.fetch);
    try {
      await expect(syncUserGmail("synthetic-user")).rejects.toThrow("Failed to list Gmail messages");
      expect(text).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      assertSafe("Gmail sync: failed to list messages", { code: "unknown_error", status: 403 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
