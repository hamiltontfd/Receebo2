import { afterAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { db, paymentNoticesTable, userBillingTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { billingPriceId } from "./billingConfig";

const captured = vi.hoisted(() => ({ email: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./emailService", () => ({
  sendPaymentAttentionEmail: captured.email,
  sendTrialEndingEmail: vi.fn(),
}));
// No Clerk test user is needed; this test only exercises billing, not identity.
vi.mock("./ownerAccess", () => ({ hasOwnerAccess: async () => false }));
vi.mock("../stripeClient", async importOriginal => {
  const actual = await importOriginal<typeof import("../stripeClient")>();
  let sync: Awaited<ReturnType<typeof actual.getStripeSync>> | undefined;
  return {
    ...actual,
    getStripeSync: async () => {
      sync ??= await actual.getStripeSync();
      // Isolated test endpoint signing key. Keep the REAL sync engine, signature
      // verification, Stripe API retrieval, and PostgreSQL writes.
      (sync as unknown as { config: { stripeWebhookSecret: string } }).config.stripeWebhookSecret = "whsec_payment_attention_test";
      return sync;
    },
  };
});
import { getUncachableStripeClient } from "../stripeClient";
import { WebhookHandlers } from "../webhookHandlers";
import { getSubscriptionStatus } from "./subscriptionStatus";

const enabled = process.env.RUN_PAYMENT_ATTENTION_STRIPE_TEST === "true";
describe.skipIf(!enabled)("payment attention with real Stripe test-clock renewal and signed webhooks", () => {
  let stripe: Stripe;
  let clockId: string | undefined;
  const userId = `payment-test-${randomUUID()}`;
  let counter = 0;
  afterAll(async () => {
    vi.useRealTimers();
    if (clockId) await stripe.testHelpers.testClocks.del(clockId);
    await db.delete(userBillingTable).where(eq(userBillingTable.userId, userId));
    vi.unstubAllEnvs();
  });

  it("fails renewal once, deduplicates concurrent/retry events, recovers, ignores delayed failures, and expires terminal access", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    stripe = await getUncachableStripeClient();
    const price = await stripe.prices.retrieve(billingPriceId("monthly")!);
    if (price.livemode || !price.recurring) throw new Error("A recurring Stripe TEST price is required");
    const now = Math.floor(Date.now() / 1000);
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now, name: "payment-attention-verification" });
    clockId = clock.id;
    const customer = await stripe.customers.create({ test_clock: clock.id, metadata: { purpose: "payment_attention_test" } });
    const card = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: card.id } });
    let subscription = await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: price.id }], default_payment_method: card.id,
    });
    expect(subscription.status).toBe("active");
    await db.insert(userBillingTable).values({
      userId, stripeCustomerId: customer.id, stripeSubscriptionId: subscription.id,
    });

    async function deliver(type: string, object: unknown) {
      const payload = Buffer.from(JSON.stringify({
        id: `evt_payment_attention_${counter++}_${randomUUID()}`, object: "event",
        api_version: "2026-03-25.dahlia", created: Math.floor(Date.now() / 1000),
        type, livemode: false, data: { object },
      }));
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: payload.toString(), secret: "whsec_payment_attention_test",
      });
      await WebhookHandlers.processWebhook(payload, signature);
    }
    await deliver("customer.subscription.updated", subscription);
    expect((await getSubscriptionStatus(userId)).plan).toBe("pro");
    const failedCard = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
    await stripe.subscriptions.update(subscription.id, { default_payment_method: failedCard.id });
    await stripe.testHelpers.testClocks.advance(clock.id, {
      frozen_time: subscription.items.data[0].current_period_end + 3600,
    });
    const deadline = Date.now() + 90000;
    while ((await stripe.testHelpers.testClocks.retrieve(clock.id)).status !== "ready") {
      if (Date.now() > deadline) throw new Error("Stripe test clock did not finish advancing");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    // Invoice finalization can follow the clock becoming ready.
    do {
      subscription = await stripe.subscriptions.retrieve(subscription.id);
      if (subscription.status === "past_due") break;
      if (Date.now() > deadline) throw new Error("Renewal did not enter past_due");
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (true);
    const invoiceId = typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice : subscription.latest_invoice!.id;
    const failedInvoice = await stripe.invoices.retrieve(invoiceId);
    expect(failedInvoice.billing_reason).toBe("subscription_cycle");
    expect(failedInvoice.status).toBe("open");
    await deliver("customer.subscription.updated", subscription);
    await Promise.all([
      deliver("invoice.payment_failed", failedInvoice),
      deliver("invoice.payment_failed", failedInvoice),
    ]);
    await deliver("invoice.payment_failed", { ...failedInvoice, attempt_count: failedInvoice.attempt_count + 1 });
    expect(captured.email).toHaveBeenCalledTimes(1);
    expect(captured.email).toHaveBeenCalledWith(userId, invoiceId, expect.stringContaining("continues until"));
    expect(await db.select().from(paymentNoticesTable).where(eq(paymentNoticesTable.userId, userId))).toHaveLength(1);
    expect(await getSubscriptionStatus(userId)).toMatchObject({ plan: "pro", paymentAttention: true });

    await stripe.subscriptions.update(subscription.id, { default_payment_method: card.id });
    const paidInvoice = await stripe.invoices.pay(invoiceId, { payment_method: card.id });
    expect(paidInvoice.status).toBe("paid");
    subscription = await stripe.subscriptions.retrieve(subscription.id);
    await deliver("invoice.paid", paidInvoice);
    await deliver("customer.subscription.updated", subscription);
    await deliver("invoice.payment_failed", failedInvoice); // old snapshot AFTER recovery
    expect(captured.email).toHaveBeenCalledTimes(1);
    expect(await getSubscriptionStatus(userId)).toMatchObject({ plan: "pro", paymentAttention: false });

    subscription = await stripe.subscriptions.cancel(subscription.id);
    expect(subscription.status).toBe("canceled");
    // Terminal snapshots use the event's second-precision timestamp, while
    // previous refetched updates use millisecond timestamps. Emit in a later
    // second so this synthetic event isn't correctly discarded as stale.
    await new Promise(resolve => setTimeout(resolve, 1100));
    await deliver("customer.subscription.deleted", subscription);
    // Application grace uses wall time, not Stripe's test-clock time.
    const end = subscription.items.data[0].current_period_end * 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(end - 1);
    expect((await getSubscriptionStatus(userId)).plan).toBe("pro");
    vi.setSystemTime(end);
    expect(await getSubscriptionStatus(userId)).toMatchObject({ plan: "free", canUseApp: false });
    vi.useRealTimers();
  }, 180000);
});
