import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const state = vi.hoisted(() => ({
  inserted: true, status: "not_started", notify: vi.fn(), milestone: vi.fn(),
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.userId = "SYNTHETIC_USER"; next(); },
}));
vi.mock("../lib/legalAcceptance", () => ({
  requireCurrentLegalAcceptance: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../lib/userDataLock", () => ({ lockUserDataMutation: (fn: any) => fn }));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ accessState: state.status }),
}));
vi.mock("../lib/accountMarket", () => ({ getAccountMarket: async () => "US" }));
vi.mock("../lib/signupNotifyService", () => ({ notifyNewTrial: state.notify }));
vi.mock("../lib/metaMilestones", () => ({
  sendMilestone: state.milestone, returnMetaMilestone: vi.fn(),
}));
vi.mock("../lib/marketGeoip", () => ({ requestCountry: () => ({ country: "US" }) }));
vi.mock("@workspace/db", () => ({
  accountTrialsTable: { userId: "userId" }, userBillingTable: {}, trialFunnelCheckoutsTable: {},
  db: { insert: () => ({ values: () => ({
    onConflictDoNothing: () => ({ returning: async () => state.inserted ? [{ userId: "SYNTHETIC_USER" }] : [] }),
  }) }) },
}));
// Unused billing paths must never load live providers, DB helpers or send mail.
vi.mock("@clerk/express", () => ({ clerkClient: {} }));
vi.mock("../stripeClient", () => ({ getUncachableStripeClient: vi.fn() }));
vi.mock("../lib/ownerAccess", () => ({ hasOwnerAccess: vi.fn() }));
vi.mock("../lib/trialFunnel", () => ({
  funnelSubject: vi.fn(), recordFunnelEvent: vi.fn(), paywallReason: vi.fn(),
  safeFunnel: vi.fn(), createFunnelCheckout: vi.fn(), confirmPaidFunnel: vi.fn(),
}));
import router from "./billing";

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  state.status = "not_started"; state.inserted = true;
  state.notify.mockResolvedValue(undefined); state.milestone.mockResolvedValue(undefined);
});
const post = () => fetch(`${origin}/billing/start-trial`, { method: "POST" });
describe("signup notification on successful trial insertion only", () => {
  it("notifies after a real insert and never on repeated no-op starts", async () => {
    expect((await post()).status).toBe(200);
    expect(state.notify).toHaveBeenCalledExactlyOnceWith({
      userId: "SYNTHETIC_USER", at: expect.any(Date), market: "US", country: "US",
    });
    state.status = "trialing";
    expect((await post()).status).toBe(200);
    expect(state.notify).toHaveBeenCalledOnce();
  });
  it("never notifies if another request already inserted the row", async () => {
    state.inserted = false;
    expect((await post()).status).toBe(200);
    expect(state.notify).not.toHaveBeenCalled();
    expect(state.milestone).not.toHaveBeenCalled();
  });
  it("does not await the email or let its failure affect signup", async () => {
    state.notify.mockImplementationOnce(() => new Promise(() => {}));
    expect((await post()).status).toBe(200);
    state.notify.mockRejectedValueOnce(new Error("synthetic failure"));
    expect((await post()).status).toBe(200);
  });
});
