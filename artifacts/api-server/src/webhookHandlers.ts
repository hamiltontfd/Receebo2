import Stripe from "stripe";
import { db, userBillingTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./lib/logger";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { sendTrialEndingEmail } from "./lib/emailService";

/**
 * Upsert the Stripe customer → user mapping and store the subscription ID.
 * Called from checkout.session.completed and subscription events.
 */
async function upsertUserBilling(
  stripeCustomerId: string,
  stripeSubscriptionId?: string | null,
): Promise<void> {
  if (!stripeCustomerId) return;

  const [existing] = await db
    .select({ userId: userBillingTable.userId })
    .from(userBillingTable)
    .where(eq(userBillingTable.stripeCustomerId, stripeCustomerId));

  if (!existing) {
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
 * Handle checkout.session.completed — grants immediate Pro access.
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
 * Handle customer.subscription.created / updated — keeps subscription ID in sync.
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
 * Handle customer.subscription.deleted — access revokes at period end via getSubscriptionStatus.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;
  logger.info(
    { customerId, subscriptionId: subscription.id },
    "webhookHandlers: subscription deleted — access revokes at period end",
  );
}

/**
 * Handle invoice.payment_failed — Stripe manages retries; log for observability.
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
 * Handle customer.subscription.trial_will_end — send a reminder email ~3 days before trial ends.
 * Uses the same trialReminderSentAt dedup flag as the nightly orphan-cleanup sweep so only
 * one email is delivered regardless of which path fires first.
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;

  // Resolve the user from our billing table
  const [billing] = await db
    .select({ userId: userBillingTable.userId })
    .from(userBillingTable)
    .where(eq(userBillingTable.stripeCustomerId, customerId));

  if (!billing) {
    logger.warn({ customerId }, "webhookHandlers: trial_will_end for unknown customer — no user_billing row");
    return;
  }

  // Atomically claim the send slot — prevents duplicate sends with the nightly sweep
  const claimed = await db
    .update(userBillingTable)
    .set({ trialReminderSentAt: new Date() })
    .where(
      and(
        eq(userBillingTable.userId, billing.userId),
        isNull(userBillingTable.trialReminderSentAt),
      ),
    )
    .returning({ userId: userBillingTable.userId });

  if (claimed.length === 0) {
    logger.info({ userId: billing.userId }, "webhookHandlers: trial reminder already sent — skipping duplicate");
    return;
  }

  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : new Date();

  // Extract plan name and charge amount from the subscription's price
  const priceItem = subscription.items?.data?.[0];
  let planName: string | undefined;
  let planAmount: number | undefined;
  let planCurrency: string | undefined;

  if (priceItem?.price) {
    planAmount = priceItem.price.unit_amount ?? undefined;
    planCurrency = priceItem.price.currency ?? undefined;

    const productId =
      typeof priceItem.price.product === "string"
        ? priceItem.price.product
        : (priceItem.price.product as Stripe.Product | null)?.id;

    if (productId) {
      try {
        const stripe = await getUncachableStripeClient();
        const product = await stripe.products.retrieve(productId);
        planName = product.name;
      } catch (err) {
        logger.warn({ err, productId }, "webhookHandlers: could not fetch product name for trial reminder");
      }
    }
  }

  logger.info(
    { userId: billing.userId, trialEnd: trialEnd.toISOString(), planName, planAmount, planCurrency },
    "webhookHandlers: sending trial-ending reminder email",
  );

  const sent = await sendTrialEndingEmail(billing.userId, trialEnd, { planName, planAmount, planCurrency });

  if (!sent) {
    // Reset flag so the nightly sweep can retry
    await db
      .update(userBillingTable)
      .set({ trialReminderSentAt: null })
      .where(eq(userBillingTable.userId, billing.userId));
    logger.warn({ userId: billing.userId }, "webhookHandlers: trial reminder email failed — flag reset for retry");
  }
}

/**
 * Handle invoice.paid — subscription is active; sync subscription ID.
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
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    // StripeSync.processWebhook ALWAYS runs first so that stripe.subscriptions is
    // kept in sync — this is the source of truth for getSubscriptionStatus().
    // It also handles signature verification using the managed webhook secret.
    const sync = await getStripeSync();

    // When STRIPE_WEBHOOK_SECRET is also set we verify the signature ourselves
    // (handles deployments using a manually configured webhook) and then still
    // call StripeSync so the stripe schema stays current.
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const stripe = await getUncachableStripeClient();
      // This throws if the signature is invalid — stops processing before StripeSync
      stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }

    // Always sync to stripe schema (source of truth for subscription status)
    await sync.processWebhook(payload, signature);

    // Parse the event for our explicit application-level handlers
    const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;

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

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
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
