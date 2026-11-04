/**
 * Privacy Policy version bump (4 Nov 2026), real PostgreSQL: an account that
 * accepted the 30 Aug 2026 documents must accept again before using the app.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, legalAcceptancesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-session"] ?? null }),
  clerkClient: { users: { getUser: async (id: string) => ({
    id, emailAddresses: [], firstName: null, lastName: null, createdAt: null,
  }) } },
}));
vi.mock("../lib/accountDeletionState", () => ({ isAccountDeletionInProgress: async () => false }));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class { async deleteObject() {} }, ObjectNotFoundError: class extends Error {}, objectStorageClient: {},
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, accessState: "paid" }),
  receiptCapReached: () => false,
}));
import account from "./account";
import receipts from "./receipts";
import { PRIVACY_VERSION, TERMS_VERSION, hasCurrentLegalAcceptance } from "../lib/legalAcceptance";

const user = `legal-bump-${randomUUID()}`;
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), account, receipts);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Accepted the previous documents.
  await db.insert(legalAcceptancesTable).values({ userId: user, termsVersion: "2026-08-30", privacyVersion: "2026-08-30", confirmedAge: true });
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.delete(legalAcceptancesTable).where(eq(legalAcceptancesTable.userId, user));
});
const call = (path: string, body?: unknown) => fetch(`${base}${path}`, {
  method: body === undefined ? "GET" : "POST",
  headers: { "Content-Type": "application/json", "x-test-session": user },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

describe("Privacy Policy version bump", () => {
  it("privacy version moved to 2026-11-04; terms unchanged", () => {
    expect(PRIVACY_VERSION).toBe("2026-11-04");
    expect(TERMS_VERSION).toBe("2026-08-30");
  });

  it("an account that accepted 2026-08-30 must accept again; old versions are refused; new acceptance unblocks", async () => {
    expect(await hasCurrentLegalAcceptance(user)).toBe(false);
    const status = await (await call("/legal/acceptance")).json();
    expect(status).toMatchObject({ accepted: false, termsVersion: "2026-08-30", privacyVersion: "2026-11-04" });
    expect((await call("/receipts")).status).toBe(428);
    expect((await call("/legal/acceptance", { termsVersion: "2026-08-30", privacyVersion: "2026-08-30", confirmedAge: true })).status).toBe(400);
    const accepted = await call("/legal/acceptance", { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, confirmedAge: true });
    expect(accepted.status).toBe(201);
    expect(await hasCurrentLegalAcceptance(user)).toBe(true);
    expect((await (await call("/legal/acceptance")).json()).accepted).toBe(true);
    expect((await call("/receipts")).status).not.toBe(428);
  });
});
