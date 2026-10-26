import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stripe: vi.fn(),
  enqueue: vi.fn(),
  paid: false,
}));
vi.mock("@clerk/express", () => ({
  clerkClient: {
    users: {
      getUser: async (id: string) => ({
        id, primaryEmailAddressId: "email_1",
        emailAddresses: [{
          id: "email_1",
          emailAddress: id === "user_owner" ? "hamiltontfd@gmail.com" : "other@example.com",
          verification: { status: "verified" },
        }],
        externalAccounts: [{
          provider: "oauth_google",
          emailAddress: id === "user_owner" ? "hamiltontfd@gmail.com" : "other@example.com",
          verification: { status: "verified" },
        }],
      }),
    },
  },
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-user"]) return res.sendStatus(401);
    req.userId = req.headers["x-test-user"];
    next();
  },
}));
vi.mock("../middlewares/guestAuth", () => ({
  requireAuthOrGuest: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-user"]) return res.sendStatus(401);
    if (req.headers["x-test-consent"] !== "accepted") return res.sendStatus(428);
    req.userId = req.headers["x-test-user"];
    next();
  },
}));
vi.mock("../lib/legalAcceptance", () => ({
  requireCurrentLegalAcceptance: (req: any, res: any, next: any) => {
    if (req.headers["x-test-consent"] !== "accepted") return res.sendStatus(428);
    next();
  },
}));
vi.mock("../lib/userDataLock", () => ({
  lockUserDataMutation: (handler: any) => handler,
}));
vi.mock("../lib/extractionQueue", () => ({ enqueueExtraction: mocks.enqueue }));
vi.mock("../lib/accountTrial", () => ({ accountTrialStatus: async () => null }));
vi.mock("../stripeClient", () => ({ getUncachableStripeClient: mocks.stripe }));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {},
}));
vi.mock("@workspace/db", () => {
  const receipt = {
    id: 123, objectPath: "/objects/uploads/test", originalFileName: "test.pdf",
    contentType: "application/pdf", status: "processing", isDraft: true,
    createdAt: new Date(), products: [],
  };
  return {
    userBillingTable: { userId: "userId", stripeCustomerId: "stripeCustomerId" },
    receiptsTable: { userId: "userId", id: "id" },
    receiptAttachmentsTable: {},
    uploadIntentsTable: { userId: "userId", objectPath: "objectPath", expiresAt: "expiresAt" },
    db: {
      select: () => ({ from: () => ({ where: async () =>
        mocks.paid ? [{ stripeCustomerId: "cus_paid" }] : [],
      }) }),
      execute: async () => ({ rows: [{
        id: "sub_paid", status: "active", trial_end: null,
        current_period_end: 4102444800, cancel_at_period_end: false,
      }] }),
      transaction: async (operation: any) => operation({
        delete: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }),
        insert: () => ({ values: () => ({ returning: async () => [receipt] }) }),
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      }),
    },
  };
});
import receiptsRouter from "./receipts";
import attachmentsRouter from "./attachments";
import billingRouter from "./billing";

let server: Server;
let base: string;
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  const app = express();
  app.use(express.json(), receiptsRouter, attachmentsRouter, billingRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(path: string, user: string, consent = "accepted") {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user": user,
      "x-test-consent": consent,
    },
    body: JSON.stringify({
      objectPath: "/objects/uploads/test", originalFileName: "test.pdf",
      contentType: "application/pdf", planType: "monthly",
      ownerAccess: true, email: "hamiltontfd@gmail.com",
    }),
  });
}

describe("owner entitlement at production feature routes", () => {
  it("allows owner receipt creation without Stripe while denying spoofed ordinary users", async () => {
    expect((await post("/receipts", "user_owner")).status).toBe(201);
    expect(mocks.enqueue).toHaveBeenCalled();
    expect((await post("/receipts", "user_other")).status).toBe(403);
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it("keeps the owner behind legal consent and authentication", async () => {
    expect((await post("/receipts", "user_owner", "missing")).status).toBe(428);
    expect((await post("/receipts", "")).status).toBe(401);
  });

  it("does not bypass attachment receipt ownership for the owner", async () => {
    expect((await post("/receipts/999/attachments", "user_owner")).status).toBe(404);
    expect((await post("/receipts/999/attachments", "user_other")).status).toBe(403);
  });

  it("blocks unnecessary owner checkout before any Stripe operation", async () => {
    const response = await post("/billing/create-checkout-session", "user_owner");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "OWNER_ACCESS_INCLUDED" });
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it("continues to admit ordinary paid users", async () => {
    mocks.paid = true;
    try {
      expect((await post("/receipts", "user_other")).status).toBe(201);
    } finally {
      mocks.paid = false;
    }
  });
});
