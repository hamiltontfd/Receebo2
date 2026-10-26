import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasOwnerAccess: vi.fn(),
  billingRows: [] as Array<{ stripeCustomerId: string; stripeSubscriptionId: string | null }>,
  execute: vi.fn(),
}));
vi.mock("./ownerAccess", () => ({ hasOwnerAccess: mocks.hasOwnerAccess }));
vi.mock("./accountTrial", () => ({ accountTrialStatus: async () => null }));
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mocks.billingRows,
      }),
    }),
    execute: mocks.execute,
  },
  userBillingTable: {
    userId: "userId",
    stripeCustomerId: "stripeCustomerId",
    stripeSubscriptionId: "stripeSubscriptionId",
  },
}));
import { getSubscriptionStatus } from "./subscriptionStatus";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  mocks.hasOwnerAccess.mockResolvedValue(false);
  mocks.billingRows = [];
  mocks.execute.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("production entitlement and subscription status", () => {
  it("gives the verified owner Pro without any Stripe customer or subscription", async () => {
    mocks.hasOwnerAccess.mockResolvedValue(true);
    expect(await getSubscriptionStatus("user_owner")).toMatchObject({
      plan: "pro",
      ownerAccess: true,
      hasBillingAccount: false,
      trialEndAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
    });
  });

  it("preserves existing subscription references for deletion and portal access", async () => {
    mocks.hasOwnerAccess.mockResolvedValue(true);
    mocks.billingRows = [{ stripeCustomerId: "cus_old", stripeSubscriptionId: "sub_old" }];
    mocks.execute.mockResolvedValue({ rows: [{
      id: "sub_old", status: "trialing", trial_end: 4102444800,
      current_period_end: 4102444800, cancel_at_period_end: true,
    }] });
    expect(await getSubscriptionStatus("user_owner")).toMatchObject({
      plan: "pro", ownerAccess: true, hasBillingAccount: true,
      stripeSubscriptionId: "sub_old", trialEndAt: null,
      currentPeriodEnd: null, cancelAtPeriodEnd: false,
    });
  });

  it("does not grant a normal unpaid user access", async () => {
    expect(await getSubscriptionStatus("user_other")).toMatchObject({ plan: "free" });
  });

  it("preserves normal paid and trialing subscriptions", async () => {
    mocks.billingRows = [{ stripeCustomerId: "cus_paid", stripeSubscriptionId: "sub_paid" }];
    for (const [status, plan] of [["active", "pro"], ["trialing", "trialing"]]) {
      mocks.execute.mockResolvedValue({ rows: [{
        id: "sub_paid", status, trial_end: 4102444800,
        current_period_end: 4102444800, cancel_at_period_end: false,
      }] });
      expect(await getSubscriptionStatus("user_other")).toMatchObject({
        plan, stripeSubscriptionId: "sub_paid",
      });
    }
  });

  it("restores the ordinary paywall immediately after owner revocation", async () => {
    mocks.hasOwnerAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await getSubscriptionStatus("user_owner")).plan).toBe("pro");
    expect((await getSubscriptionStatus("user_owner")).plan).toBe("free");
  });

  it("keeps the existing grace cutoff for past_due and terminal unpaid, and clears attention on recovery", async () => {
    mocks.billingRows = [{ stripeCustomerId: "cus_paid", stripeSubscriptionId: "sub_paid" }];
    for (const status of ["past_due", "unpaid"]) {
      for (const expired of [false, true]) {
        mocks.execute.mockResolvedValue({ rows: [{
          id: "sub_paid", status, trial_end: null,
          current_period_end: expired ? 1 : 4102444800, cancel_at_period_end: false,
        }] });
        expect(await getSubscriptionStatus("user_other")).toMatchObject({
          plan: expired ? "free" : "pro", paymentAttention: true, canUseApp: !expired,
        });
      }
    }
    mocks.execute.mockResolvedValue({ rows: [{
      id: "sub_paid", status: "active", current_period_end: 4102444800,
    }] });
    expect(await getSubscriptionStatus("user_other")).toMatchObject({ plan: "pro", paymentAttention: false });
  });
});
