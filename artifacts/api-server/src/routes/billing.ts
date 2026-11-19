import { Router, type IRouter } from "express";
import { accessEndedAt, deletionDueAt, isFrozen, scheduledDeletionDate } from "../lib/accountLifecycleSchedule";
import { and, eq, sql } from "drizzle-orm";
import { db, userBillingTable, accountTrialsTable, trialFunnelCheckoutsTable } from "@workspace/db";
import { funnelSubject, recordFunnelEvent, paywallReason, safeFunnel, createFunnelCheckout, confirmPaidFunnel } from "../lib/trialFunnel";
import { TRIAL_DURATION_MS } from "../lib/accountTrial";
import { returnMetaMilestone, sendMilestone } from "../lib/metaMilestones";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { lockUserDataMutation } from "../lib/userDataLock";
import { getUncachableStripeClient } from "../stripeClient";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";
import { hasOwnerAccess } from "../lib/ownerAccess";
import { billingOrigin } from "../lib/billingUrls";
import { billingPriceId, billingPortalConfiguration, describeChargedPlan, effectiveBillingCurrency, priceMatchesSelection, PLAN_AMOUNTS, type BillingCurrency } from "../lib/billingConfig";
import { getAccountMarket } from "../lib/accountMarket";
import { notifyOnlyCreatedTrial } from "../lib/signupNotify";
import { notifyNewTrial } from "../lib/signupNotifyService";
import { requestCountry } from "../lib/marketGeoip";

const router: IRouter = Router();

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? null;
  } catch {
    return null;
  }
}

type PricingQuote = {
  basis: "offer" | "subscription" | "unavailable";
  currency: BillingCurrency | null;
  monthly: number | null;
  yearly: number | null;
};

/**
 * Quote for GET /billing/subscription. An in-force subscription is described
 * from Subscription.currency (the currency it bills in). Price.currency is the
 * shared Price default and is not the charge. If that subscription currency
 * cannot be read, the market price is not shown as the charge.
 */
async function accountPricing(userId: string, inForce: boolean): Promise<PricingQuote> {
  const market = await getAccountMarket(userId).catch(() => null);
  const offerCurrency = effectiveBillingCurrency(market);
  const offer: PricingQuote = {
    basis: "offer", currency: offerCurrency,
    monthly: PLAN_AMOUNTS[offerCurrency].monthly, yearly: PLAN_AMOUNTS[offerCurrency].yearly,
  };
  const unavailable: PricingQuote = { basis: "unavailable", currency: null, monthly: null, yearly: null };
  try {
    const [billing] = await db.select({ stripeCustomerId: userBillingTable.stripeCustomerId })
      .from(userBillingTable).where(eq(userBillingTable.userId, userId));
    if (!billing?.stripeCustomerId) return inForce ? unavailable : offer;
    const result = await db.execute(sql`
      SELECT status,
        COALESCE(current_period_end, (items->'data'->0->>'current_period_end')::bigint) AS current_period_end,
        currency AS subscription_currency
      FROM stripe.subscriptions
      WHERE customer = ${billing.stripeCustomerId}
        AND livemode = ${process.env.NODE_ENV === "production"}
      ORDER BY created DESC
      LIMIT 1
    `);
    const row = result.rows[0] as {
      status?: string; current_period_end?: number | null; subscription_currency?: string | null; currency?: string | null;
    } | undefined;
    if (!row) return inForce ? unavailable : offer;
    const end = row.current_period_end ?? null;
    const current = row.status === "active" || row.status === "trialing" || row.status === "past_due" || row.status === "unpaid"
      || (row.status === "canceled" && !!end && end * 1000 > Date.now());
    if (!current) return inForce ? unavailable : offer;
    const charged = describeChargedPlan({
      subscriptionCurrency: row.subscription_currency ?? row.currency,
      priceCurrency: (row as { items?: { data?: Array<{ price?: { currency?: string; unit_amount?: number } }> } }).items?.data?.[0]?.price?.currency,
      priceUnitAmount: (row as { items?: { data?: Array<{ price?: { unit_amount?: number } }> } }).items?.data?.[0]?.price?.unit_amount,
    });
    if (charged.basis === "unavailable") return unavailable;
    return charged;
  } catch {
    return inForce ? unavailable : offer;
  }
}

/** GET /billing/subscription — current user's plan status */
router.get("/billing/subscription", requireAuth, async (req, res): Promise<void> => {
  try {
    const status = await getSubscriptionStatus(req.userId!);
    if (status.accessState === "paid") {
      await safeFunnel(() => confirmPaidFunnel(req.userId!));
    }
    // Frozen accounts see when their data will be deleted (spec: docs/account-lifecycle.md).
    const now = new Date();
    const dataDeletionAt = isFrozen(status)
      ? (await scheduledDeletionDate(req.userId!)) ?? deletionDueAt(accessEndedAt(status, now), now)
      : null;
    res.json({
      ...status,
      dataDeletionAt: dataDeletionAt?.toISOString() ?? null,
      stripeSubscriptionId: undefined,
      plan: status.plan,
      trialEndAt: status.trialEndAt?.toISOString() ?? null,
      currentPeriodEnd: status.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: status.cancelAtPeriodEnd,
      ownerAccess: status.ownerAccess === true,
      hasBillingAccount: status.hasBillingAccount === true,
      pricing: await accountPricing(req.userId!, status.plan === "pro" || status.plan === "trialing"),
    });
  } catch (err) {
    logger.error({ err }, "billing: failed to get subscription status");
    res.status(500).json({ error: "Failed to load subscription" });
  }
});

router.post("/billing/trial-funnel", requireAuth, requireCurrentLegalAcceptance,
  lockUserDataMutation(async (req, res): Promise<void> => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(k => !["event", "reason", "attemptId"].includes(k)) ||
      !["paywall_viewed", "checkout_canceled"].includes(body.event) ||
      (body.event === "paywall_viewed" && (!paywallReason(body.reason) || body.attemptId !== undefined)) ||
      (body.event === "checkout_canceled" && (body.reason !== undefined ||
        typeof body.attemptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.attemptId)))) {
      res.status(400).json({ error: "Invalid funnel interaction" });
      return;
    }
    const subjectId = await funnelSubject(req.userId!);
    if (subjectId) {
      if (body.event === "paywall_viewed") {
        const status = await getSubscriptionStatus(req.userId!);
        if (paywallReason(status.accessState) === body.reason) {
          await recordFunnelEvent(subjectId, "paywall_viewed", body.reason, null, body.reason);
        }
      } else {
        const [attempt] = await db.select().from(trialFunnelCheckoutsTable).where(and(
          eq(trialFunnelCheckoutsTable.id, body.attemptId),
          eq(trialFunnelCheckoutsTable.subjectId, subjectId),
        ));
        if (attempt) {
          await recordFunnelEvent(subjectId, "checkout_canceled", attempt.id,
            attempt.interval as "monthly" | "yearly", paywallReason(attempt.reason ?? undefined));
        }
      }
    }
    res.sendStatus(204);
  }));

router.post("/billing/start-trial", requireAuth, requireCurrentLegalAcceptance,
  lockUserDataMutation(async (req, res): Promise<void> => {
    const status = await getSubscriptionStatus(req.userId!);
    if (status.accessState === "not_started") {
      const startedAt = new Date();
      const market = await getAccountMarket(req.userId!).catch(() => null);
      const inserted = await db.insert(accountTrialsTable).values({
        userId: req.userId!,
        startedAt,
        endsAt: new Date(startedAt.getTime() + TRIAL_DURATION_MS),
        monthlyPriceId: billingPriceId("monthly", market),
        yearlyPriceId: billingPriceId("yearly", market),
      }).onConflictDoNothing().returning({ userId: accountTrialsTable.userId });
      notifyOnlyCreatedTrial(inserted.length > 0, () => notifyNewTrial({
        userId: req.userId!, at: startedAt, market, country: requestCountry(req).country,
      }));
      if (inserted.length) returnMetaMilestone(res, await sendMilestone(req.userId!, "CompleteRegistration"));
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
  const { planType, metaEventId: rawEventId } = req.body as { planType?: string; metaEventId?: unknown };
  const metaEventId = typeof rawEventId === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(rawEventId) ? rawEventId : undefined;
  if (!planType || !["monthly", "yearly"].includes(planType)) {
    res.status(400).json({ error: "planType must be 'monthly' or 'yearly'" });
    return;
  }

  const userId = req.userId!;

  try {
    const status = await getSubscriptionStatus(userId);
    if (status.plan === "pro" || status.accessState === "legacy_stripe_trial") {
      res.status(409).json({ error: "SUBSCRIPTION_ALREADY_ACTIVE", message: "Manage your existing subscription in billing." });
      return;
    }
    const interval = planType as "monthly" | "yearly";
    let market: Awaited<ReturnType<typeof getAccountMarket>>;
    try {
      market = await getAccountMarket(userId);
    } catch (err) {
      logger.warn({ err }, "billing: account market unavailable");
      res.status(503).json({ error: "Could not read the account market" });
      return;
    }
    const priceId = billingPriceId(interval, market);
    if (!priceId) {
      res.status(503).json({ error: "Stripe price IDs are not configured yet" });
      return;
    }
    // Count checkout starts only once checkout can actually be created.
    await safeFunnel(async () => {
      const subjectId = await funnelSubject(userId);
      if (subjectId) await recordFunnelEvent(subjectId, "plan_selected", interval, interval, paywallReason(status.accessState));
    });
    // Resolve configuration before creating customers or checkout sessions.
    const base = billingOrigin();
    const stripe = await getUncachableStripeClient();
    // Reject mixed-mode or wrong-interval prices before creating a customer.
    const [eligibility] = await db.select().from(accountTrialsTable)
      .where(eq(accountTrialsTable.userId, userId));
    // A saved founding Price id is kept when it still contains the market's
    // currency at the founding amount. US and EUR share that id; the session
    // currency selects the option. A saved id with no USD option is not charged
    // as EUR. Founding eligibility itself is unchanged.
    const wantCurrency = effectiveBillingCurrency(market);
    const live = process.env.NODE_ENV === "production";
    const savedPriceId = planType === "yearly" ? eligibility?.yearlyPriceId : eligibility?.monthlyPriceId;
    let protectedPriceId = savedPriceId ?? priceId;
    const loadPrice = (id: string) => stripe.prices.retrieve(id, { expand: ["currency_options"] });
    let price = await loadPrice(protectedPriceId);
    if (savedPriceId && savedPriceId !== priceId && !priceMatchesSelection(price, wantCurrency, interval, live)) {
      protectedPriceId = priceId;
      price = await loadPrice(priceId);
    }
    // A missing or wrong USD option blocks this new checkout. Do not charge the
    // EUR default instead, and do not remove a currency option a subscription
    // already uses in order to force that fallback.
    if (!priceMatchesSelection(price, wantCurrency, interval, live)) {
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
        monthlyPriceId: eligibility.monthlyPriceId ?? (planType === "monthly" ? protectedPriceId : billingPriceId("monthly", market)),
        yearlyPriceId: eligibility.yearlyPriceId ?? (planType === "yearly" ? protectedPriceId : billingPriceId("yearly", market)),
      }).where(eq(accountTrialsTable.userId, userId));
    }
    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
    for (const open of openSessions.data) {
      await stripe.checkout.sessions.expire(open.id);
    }
    let attemptId: string | null = null;
    await safeFunnel(async () => {
      attemptId = await createFunnelCheckout(userId, interval, paywallReason(status.accessState));
    });
    // EUR and USD are options on one Price. The session currency pins which
    // option is charged. Adaptive Pricing is disabled for that session only,
    // so a third currency is not offered. BR keeps its own Price and is not
    // given a currency override. The Dashboard Adaptive Pricing setting is untouched.
    const fixedCurrency = wantCurrency === "EUR" || wantCurrency === "USD";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: protectedPriceId, quantity: 1 }],
      mode: "subscription",
      ...(fixedCurrency ? { currency: wantCurrency.toLowerCase(), adaptive_pricing: { enabled: false } } : {}),
      subscription_data: { metadata: { userId, offer: "founding_customer" } },
      metadata: { userId, ...(metaEventId ? { meta_event_id: metaEventId } : {}) },
      success_url: `${base}/search?checkout=success`,
      cancel_url: `${base}/search?checkout=cancel${attemptId ? `&attempt=${attemptId}` : ""}`,
    });

    const currency = wantCurrency;
    const unit = price.currency_options?.[currency.toLowerCase()]?.unit_amount
      ?? (price.currency?.toLowerCase() === currency.toLowerCase() ? price.unit_amount : null);
    res.json({
      url: session.url,
      ...(metaEventId ? { meta: { eventId: metaEventId, currency, value: typeof unit === "number" ? unit / 100 : null } } : {}),
    });
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
