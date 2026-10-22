import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userBillingTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { lockUserDataMutation } from "../lib/userDataLock";
import { getUncachableStripeClient } from "../stripeClient";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";
import { hasOwnerAccess } from "../lib/ownerAccess";

const router: IRouter = Router();

function appBaseUrl(req: { protocol: string; get: (h: string) => string | undefined }): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "https://receebo.replit.app";
}

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

  const priceId =
    planType === "yearly"
      ? process.env.STRIPE_YEARLY_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;

  if (!priceId) {
    res.status(503).json({ error: "Stripe price IDs are not configured yet" });
    return;
  }

  const userId = req.userId!;

  try {
    const stripe = await getUncachableStripeClient();

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

    const base = appBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: { trial_period_days: 7 },
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

    const stripe = await getUncachableStripeClient();
    const base = appBaseUrl(req);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${base}/settings`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    logger.error({ err }, "billing: create-portal-session failed");
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

export default router;
