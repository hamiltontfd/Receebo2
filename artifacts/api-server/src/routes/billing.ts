import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userBillingTable, accountTrialsTable } from "@workspace/db";
import { TRIAL_DURATION_MS } from "../lib/accountTrial";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { lockUserDataMutation } from "../lib/userDataLock";
import { getUncachableStripeClient } from "../stripeClient";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";
import { hasOwnerAccess } from "../lib/ownerAccess";
import { billingOrigin } from "../lib/billingUrls";
import { billingPriceId, billingPortalConfiguration } from "../lib/billingConfig";

const router: IRouter = Router();

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** GET /billing/subscription — current user's plan status */
router.get("/billing/subscription", requireAuth, async (req, res): Promise<void> => {
  try {
    const status = await getSubscriptionStatus(req.userId!);
    res.json({
      ...status,
      stripeSubscriptionId: undefined,
      plan: status.plan,
      trialEndAt: status.trialEndAt?.toISOString() ?? null,
      currentPeriodEnd: status.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: status.cancelAtPeriodEnd,
      ownerAccess: status.ownerAccess === true,
      hasBillingAccount: status.hasBillingAccount === true,
    });
  } catch (err) {
    logger.error({ err }, "billing: failed to get subscription status");
    res.status(500).json({ error: "Failed to load subscription" });
  }
});

router.post("/billing/start-trial", requireAuth, requireCurrentLegalAcceptance,
  lockUserDataMutation(async (req, res): Promise<void> => {
    const status = await getSubscriptionStatus(req.userId!);
    if (status.accessState === "not_started") {
      const startedAt = new Date();
      await db.insert(accountTrialsTable).values({
        userId: req.userId!,
        startedAt,
        endsAt: new Date(startedAt.getTime() + TRIAL_DURATION_MS),
        monthlyPriceId: billingPriceId("monthly"),
        yearlyPriceId: billingPriceId("yearly"),
      }).onConflictDoNothing();
    }
    res.json({ started: true });
  }));

/** POST /billing/create-checkout-session — start Stripe Checkout */
router.post("/billing/create-checkout-session", requireAuth, requireCurrentLegalAcceptance, lockUserDataMutation(async (req, res): Promise<void> => {
  if (await hasOwnerAccess(req.userId!)) {
    res.status(409).json({
      error: "OWNER_ACCESS_INCLUDED",
      message: "Your Owner access already includes all Pro features. No subscription is needed.",
    });
    return;
  }
  const { planType } = req.body as { planType?: string };
  if (!planType || !["monthly", "yearly"].includes(planType)) {
    res.status(400).json({ error: "planType must be 'monthly' or 'yearly'" });
    return;
  }

  const priceId = billingPriceId(planType as "monthly" | "yearly");

  if (!priceId) {
    res.status(503).json({ error: "Stripe price IDs are not configured yet" });
    return;
  }

  const userId = req.userId!;

  try {
    const status = await getSubscriptionStatus(userId);
    if (status.plan === "pro" || status.accessState === "legacy_stripe_trial") {
      res.status(409).json({ error: "SUBSCRIPTION_ALREADY_ACTIVE", message: "Manage your existing subscription in billing." });
      return;
    }
    // Resolve configuration before creating customers or checkout sessions.
    const base = billingOrigin();
    const stripe = await getUncachableStripeClient();
    // Reject mixed-mode or wrong-interval prices before creating a customer.
    const [eligibility] = await db.select().from(accountTrialsTable)
      .where(eq(accountTrialsTable.userId, userId));
    const protectedPriceId = (planType === "yearly" ? eligibility?.yearlyPriceId : eligibility?.monthlyPriceId) ?? priceId;
    const price = await stripe.prices.retrieve(protectedPriceId);
    const expectedInterval = planType === "yearly" ? "year" : "month";
    if (!price.active || price.livemode !== (process.env.NODE_ENV === "production") ||
      price.recurring?.interval !== expectedInterval || price.recurring.interval_count !== 1 ||
      price.currency !== "eur" || price.unit_amount !== (planType === "yearly" ? 2499 : 299)) {
      res.status(503).json({ error: "Stripe price does not match the configured plan and environment" });
      return;
    }

    const [existingBilling] = await db
      .select({ stripeCustomerId: userBillingTable.stripeCustomerId })
      .from(userBillingTable)
      .where(eq(userBillingTable.userId, userId));

    let customerId = existingBilling?.stripeCustomerId;

    if (!customerId) {
      const email = await getUserEmail(userId);
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: { userId },
      });
      customerId = customer.id;

      // Use onConflictDoUpdate to handle a race where a concurrent request
      // already inserted a row. Re-read the winner's customer ID so the
      // checkout session maps to the persisted customer.
      const [upserted] = await db
        .insert(userBillingTable)
        .values({ userId, stripeCustomerId: customerId })
        .onConflictDoUpdate({
          target: userBillingTable.userId,
          set: { stripeCustomerId: userBillingTable.stripeCustomerId },
        })
        .returning({ stripeCustomerId: userBillingTable.stripeCustomerId });

      customerId = upserted?.stripeCustomerId ?? customerId;
    }

    // Stripe is authoritative even while webhook synchronization is delayed.
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (subscriptions.data.some(s => ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status))) {
      res.status(409).json({ error: "SUBSCRIPTION_ALREADY_ACTIVE", message: "Manage your existing subscription in billing." });
      return;
    }
    // Freeze both intervals on first explicit checkout, independently of payment success.
    // Abandoning checkout never removes founding eligibility.
    if (eligibility) {
      await db.update(accountTrialsTable).set({
        monthlyPriceId: eligibility.monthlyPriceId ?? (planType === "monthly" ? protectedPriceId : billingPriceId("monthly")),
        yearlyPriceId: eligibility.yearlyPriceId ?? (planType === "yearly" ? protectedPriceId : billingPriceId("yearly")),
      }).where(eq(accountTrialsTable.userId, userId));
    }
    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
    for (const open of openSessions.data) {
      await stripe.checkout.sessions.expire(open.id);
    }
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: protectedPriceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: { metadata: { userId, offer: "founding_customer" } },
      success_url: `${base}/search?checkout=success`,
      cancel_url: `${base}/search?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "billing: create-checkout-session failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
}));

/** POST /billing/create-portal-session — open Stripe Customer Portal */
router.post("/billing/create-portal-session", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  try {
    const [billing] = await db
      .select({ stripeCustomerId: userBillingTable.stripeCustomerId })
      .from(userBillingTable)
      .where(eq(userBillingTable.userId, userId));

    if (!billing?.stripeCustomerId) {
      res.status(404).json({ error: "No billing account found" });
      return;
    }

    const base = billingOrigin();
    const stripe = await getUncachableStripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      ...(billingPortalConfiguration() ? { configuration: billingPortalConfiguration() } : {}),
      return_url: `${base}/settings`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    logger.error({ err }, "billing: create-portal-session failed");
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

export default router;
