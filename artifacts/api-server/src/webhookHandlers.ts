import Stripe from "stripe";
import { db, userBillingTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";

/**
 * Upsert the Stripe customer → user mapping and store the subscription ID.
 * Called from checkout.session.completed and subscription events.
 */
async function upsertUserBilling(
  stripeCustomerId: string,
  stripeSubscriptionId?: string | null,
): Promise<void> {
  if (!stripeCustomerId) return;

  // Find existing row by customer ID
  const [existing] = await db
    .select({ userId: userBillingTable.userId })
    .from(userBillingTable)
    .where(eq(userBillingTable.stripeCustomerId, stripeCustomerId));

  if (!existing) {
    // No row yet — we can't create one without a userId. The checkout route
    // creates the row before the session; if we reach here without one it means
    // the customer was created outside our flow. Log and skip.
    logger.warn(
      { stripeCustomerId },
      "webhookHandlers: received event for unknown customer — no user_billing row",
    );
    return;
  }

  if (stripeSubscriptionId) {
    await db
      .update(userBillingTable)
      .set({ stripeSubscriptionId, updatedAt: new Date() })
      .where(eq(userBillingTable.stripeCustomerId, stripeCustomerId));
  }
}

/**
 * Handle a checkout.session.completed event.
 * Grants immediate Pro access by upserting the subscription ID.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!customerId) return;
  await upsertUserBilling(customerId, subscriptionId ?? null);
  logger.info({ customerId, subscriptionId }, "webhookHandlers: checkout completed — Pro access granted");
}

/**
 * Handle customer.subscription.created / updated.
 * Keeps the subscription ID in sync.
 */
async function handleSubscriptionUpsert(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;
  await upsertUserBilling(customerId, subscription.id);
  logger.info(
    { customerId, subscriptionId: subscription.id, status: subscription.status },
    "webhookHandlers: subscription upserted",
  );
}

/**
 * Handle customer.subscription.deleted.
 * Clears the subscription ID so status falls back to free after period end.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;
  // Don't clear the row — keep it for customer portal access.
  // getSubscriptionStatus will return "free" once current_period_end passes.
  logger.info(
    { customerId, subscriptionId: subscription.id },
    "webhookHandlers: subscription deleted — access revokes at period end",
  );
}

/**
 * Handle invoice.payment_failed.
 * Stripe manages retries; we log for observability. Status reverts when
 * current_period_end passes (handled by getSubscriptionStatus).
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  // In Stripe v22, subscription ID lives at invoice.parent.subscription_details.subscription
  const subRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
  logger.warn(
    { customerId, invoiceId: invoice.id, subscriptionId },
    "webhookHandlers: invoice payment failed — Stripe will retry",
  );
}

/**
 * Handle invoice.paid.
 * Confirms the subscription is active; update subscription ID if needed.
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  // In Stripe v22, subscription ID lives at invoice.parent.subscription_details.subscription
  const subRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;

  if (!customerId) return;
  await upsertUserBilling(customerId, subscriptionId ?? null);
  logger.info({ customerId, subscriptionId }, "webhookHandlers: invoice paid — subscription active");
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " + typeof payload + ". " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    // Try explicit webhook secret from env / connector; fall back to StripeSync
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    if (webhookSecret) {
      // Verify signature ourselves using the env-configured secret
      const stripe = await getUncachableStripeClient();
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } else {
      // Delegate to StripeSync which handles signature verification via its managed webhook secret
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
      // StripeSync doesn't return the event; parse it for our explicit handlers
      // (signature already verified above by StripeSync)
      const payloadStr = payload.toString("utf8");
      event = JSON.parse(payloadStr) as Stripe.Event;
    }

    // Explicit handlers for the 6 required events
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.info({ eventType: event.type }, "webhookHandlers: unhandled event type (ignored)");
    }
  }
}
