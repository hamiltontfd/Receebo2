import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const mocks = vi.hoisted(() => ({
  invoice: vi.fn(), subscription: vi.fn(), paid: vi.fn(), email: vi.fn(),
  owner: vi.fn(), ledger: new Set<string>(), transaction: vi.fn(),
  billing: { userId: "user_paid", stripeSubscriptionId: "sub_paid" } as object | undefined,
}));
vi.mock("../stripeClient", () => ({
  getUncachableStripeClient: async () => ({
    invoices: { retrieve: mocks.invoice, list: mocks.paid },
    subscriptions: { retrieve: mocks.subscription },
  }),
  getStripeSync: async () => ({
    // Real Stripe signature verification, no unsigned test bypass.
    processWebhook: async (payload: Buffer, signature: string) => {
      new Stripe("sk_test_fixture").webhooks.constructEvent(payload, signature, "whsec_fixture");
    },
  }),
}));
vi.mock("./emailService", () => ({ sendPaymentAttentionEmail: mocks.email, sendTrialEndingEmail: vi.fn() }));
vi.mock("./ownerAccess", () => ({ hasOwnerAccess: mocks.owner }));
vi.mock("@workspace/db", () => ({
  userBillingTable: { stripeCustomerId: "customer" },
  paymentNoticesTable: { invoiceId: "invoice" },
  db: {
    select: () => ({ from: () => ({ where: async () => mocks.billing ? [mocks.billing] : [] }) }),
    transaction: mocks.transaction,
  },
}));
import { WebhookHandlers } from "../webhookHandlers";
import { paymentAccessMessage } from "./paymentAttention";

const invoice = {
  id: "in_failed", customer: "cus_paid", billing_reason: "subscription_cycle",
  livemode: false, status: "open", amount_remaining: 299,
  parent: { subscription_details: { subscription: "sub_paid" } },
};
async function signedFailure(overrides = {}, signatureOverride?: string) {
  const payload = Buffer.from(JSON.stringify({
    id: `evt_failure`, type: "invoice.payment_failed", livemode: false,
    data: { object: { ...invoice, ...overrides } },
  }));
  const signature = new Stripe("sk_test_fixture").webhooks.generateTestHeaderString({
    payload: payload.toString(), secret: "whsec_fixture",
  });
  await WebhookHandlers.processWebhook(payload, signatureOverride ?? signature);
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
  vi.clearAllMocks();
  mocks.ledger.clear();
  mocks.billing = { userId: "user_paid", stripeSubscriptionId: "sub_paid" };
  mocks.invoice.mockResolvedValue({ ...invoice });
  mocks.subscription.mockResolvedValue({
    id: "sub_paid", customer: "cus_paid", livemode: false, status: "past_due",
    latest_invoice: invoice.id, items: { data: [{ current_period_end: 4102444800 }] },
  });
  mocks.paid.mockResolvedValue({ data: [{ id: "in_previous", amount_paid: 299 }] });
  mocks.owner.mockResolvedValue(false);
  mocks.email.mockResolvedValue(undefined);
  let queue = Promise.resolve();
  mocks.transaction.mockImplementation((fn: (tx: unknown) => Promise<void>) => {
    const run = queue.then(async () => {
      await fn({
        execute: vi.fn(),
        select: () => ({ from: () => ({ where: async () => mocks.ledger.has(invoice.id) ? [{}] : [] }) }),
        insert: () => ({ values: async (row: { invoiceId: string }) => mocks.ledger.add(row.invoiceId) }),
      });
    });
    queue = run.catch(() => {});
    return run;
  });
});

describe("signed renewal payment notifications", () => {
  it("sends once for duplicate events and repeated failed attempts, including concurrent deliveries", async () => {
    await Promise.all([signedFailure(), signedFailure(), signedFailure({ attempt_count: 2 })]);
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email).toHaveBeenCalledWith("user_paid", invoice.id, expect.stringContaining("continues until"));
  });
  it("rejects invalid signatures before any side effects", async () => {
    await expect(signedFailure({}, "invalid")).rejects.toThrow();
    expect(mocks.invoice).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("ignores delayed failure events after successful recovery", async () => {
    mocks.invoice.mockResolvedValue({ ...invoice, status: "paid", amount_remaining: 0 });
    await signedFailure();
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it.each(["active", "trialing", "canceled", "incomplete_expired"])("ignores stale failure for %s subscriptions", async status => {
    mocks.subscription.mockResolvedValue({
      status, latest_invoice: invoice.id, customer: "cus_paid", livemode: false,
    });
    await signedFailure();
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("ignores an old invoice when a newer renewal exists", async () => {
    mocks.subscription.mockResolvedValue({
      status: "past_due", latest_invoice: "in_newer", customer: "cus_paid", livemode: false,
    });
    await signedFailure();
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("does not notify no-card trials, unknown customers, or trial conversions without prior paid invoices", async () => {
    await signedFailure({ billing_reason: "subscription_create" });
    expect(mocks.invoice).not.toHaveBeenCalled();
    mocks.paid.mockResolvedValue({ data: [{ id: "in_trial", amount_paid: 0 }] });
    await signedFailure();
    mocks.paid.mockResolvedValue({ data: [{ id: "in_paid", amount_paid: 299 }] });
    mocks.billing = undefined;
    await signedFailure();
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("ignores live-mode events in test mode", async () => {
    await signedFailure({ livemode: true });
    expect(mocks.invoice).not.toHaveBeenCalled();
  });
  it("retries after delivery failure instead of permanently claiming the notice", async () => {
    mocks.email.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(signedFailure()).rejects.toThrow("provider unavailable");
    expect(mocks.ledger.size).toBe(0);
    await signedFailure();
    expect(mocks.ledger.size).toBe(1);
    expect(mocks.email).toHaveBeenCalledTimes(2);
  });
  it("accurately explains terminal expiry and preserves Owner access wording", async () => {
    const subscription = await mocks.subscription();
    mocks.subscription.mockResolvedValue({ ...subscription, status: "unpaid", items: { data: [{ current_period_end: 1 }] } });
    await signedFailure();
    expect(mocks.email).toHaveBeenLastCalledWith("user_paid", invoice.id, expect.stringContaining("access has ended"));
    mocks.ledger.clear();
    mocks.owner.mockResolvedValue(true);
    await signedFailure();
    expect(mocks.email).toHaveBeenLastCalledWith("user_paid", invoice.id, expect.stringContaining("Owner access is unchanged"));
  });
  it("uses the exact existing cutoff, including equality and missing dates", () => {
    const cutoff = new Date("2030-01-01T00:00:00Z");
    expect(paymentAccessMessage(cutoff, new Date(cutoff.getTime() - 1))).toContain("continues until");
    expect(paymentAccessMessage(cutoff, cutoff)).toContain("access has ended");
    expect(paymentAccessMessage(null)).toContain("access has ended");
  });
});
