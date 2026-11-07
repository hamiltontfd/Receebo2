import { logger } from "./logger";

export type BillingPlan = "monthly" | "yearly";
export type BillingCurrency = "EUR" | "BRL" | "USD";

/**
 * Founding plan amounts in minor units.
 * EUR and USD are two currencies of the same Price (currency_options).
 * BR stays on its own BRL Prices (Hamilton, 4 Nov 2026: R$20/month, R$200/year).
 * US is US$3.50/month and US$28.50/year (Hamilton, 7 Nov 2026).
 */
export const PLAN_AMOUNTS: Record<BillingCurrency, Record<BillingPlan, number>> = {
  EUR: { monthly: 299, yearly: 2499 },
  BRL: { monthly: 2000, yearly: 20000 },
  USD: { monthly: 350, yearly: 2850 },
};

/** Account market -> billing currency. BR is BRL. US is USD. PT and unknown stay EUR. */
export function billingCurrencyForMarket(market: unknown): BillingCurrency {
  if (market === "BR") return "BRL";
  if (market === "US") return "USD";
  return "EUR";
}

function envPriceId(plan: BillingPlan, suffix: string): string | undefined {
  const mode = process.env.NODE_ENV === "production" ? "LIVE" : "TEST";
  const interval = plan.toUpperCase();
  return process.env[`STRIPE_${mode}_${interval}_PRICE_ID${suffix}`] ||
    process.env[`STRIPE_${interval}_PRICE_ID${suffix}`] || undefined;
}

/**
 * Price id for a plan. EUR and USD share STRIPE_{TEST|LIVE}_{MONTHLY|YEARLY}_PRICE_ID.
 * BR accounts use the `_BRL` ids; when those are missing they fall back to the EUR price (logged).
 * US never falls back to a different id or to EUR.
 */
export function billingPriceId(plan: BillingPlan, market?: unknown): string | undefined {
  if (billingCurrencyForMarket(market) === "BRL") {
    const brl = envPriceId(plan, "_BRL");
    if (brl) return brl;
    logger.warn({ plan }, "billing: BRL price id not configured; falling back to EUR");
  }
  return envPriceId(plan, "");
}

/**
 * Currency for a market. US is USD even before Stripe is checked; checkout
 * refuses to charge if that Price has no matching USD option. BR is EUR only
 * when its own price ids are missing.
 */
export function effectiveBillingCurrency(market: unknown): BillingCurrency {
  if (billingCurrencyForMarket(market) !== "BRL") return billingCurrencyForMarket(market);
  return envPriceId("monthly", "_BRL") && envPriceId("yearly", "_BRL") ? "BRL" : "EUR";
}

export type CheckoutPrice = {
  active?: boolean | null;
  livemode?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  product?: string | { id?: string | null } | null;
  recurring?: { interval?: string | null; interval_count?: number | null; usage_type?: string | null } | null;
  currency_options?: Record<string, { unit_amount?: number | null } | null> | null;
};

/** Amount for the selected currency: the Price default, else that currency_option. */
export function amountForCurrency(price: CheckoutPrice, currency: BillingCurrency): number | null {
  const code = currency.toLowerCase();
  if ((price.currency ?? "").toLowerCase() === code && typeof price.unit_amount === "number") return price.unit_amount;
  const option = price.currency_options?.[code]?.unit_amount;
  return typeof option === "number" ? option : null;
}

/**
 * The selected currency on this Price must be the founding amount for that
 * plan. Interval, live mode and product are checked too. A missing USD option
 * is not a match, so the caller must not charge EUR instead.
 */
export function priceMatchesSelection(
  price: CheckoutPrice,
  currency: BillingCurrency,
  plan: BillingPlan,
  livemode: boolean,
): boolean {
  if (!price.active || price.livemode !== livemode) return false;
  // The environment stores price ids, not a product id. A non-empty product is
  // required so a price with no product is rejected. It does not prove this is
  // the Receebo product: another product with the same amounts would still pass.
  const product = typeof price.product === "string" ? price.product : price.product?.id;
  if (!product) return false;
  const interval = plan === "yearly" ? "year" : "month";
  if (price.recurring?.interval !== interval || price.recurring.interval_count !== 1) return false;
  if (price.recurring.usage_type && price.recurring.usage_type !== "licensed") return false;
  return amountForCurrency(price, currency) === PLAN_AMOUNTS[currency][plan];
}

export type ChargedPlan =
  | { basis: "subscription"; currency: BillingCurrency; monthly: number; yearly: number }
  | { basis: "unavailable" };

/**
 * Currency and founding amounts of a subscription that is already in force.
 * Stripe's Subscription.currency is the currency the subscription bills in.
 * Price.currency stays the Price default (EUR on the shared Price) even when
 * the subscription was opened on the USD option, so it is not consulted.
 * The amounts are that currency's options (USD 350/2850, EUR 299/2499), not
 * the default Price unit_amount. No currency means the charge is unknown.
 */
export function describeChargedPlan(input: {
  subscriptionCurrency: unknown;
  priceCurrency?: unknown;
  priceUnitAmount?: unknown;
}): ChargedPlan {
  void input.priceCurrency;
  void input.priceUnitAmount;
  const code = typeof input.subscriptionCurrency === "string" ? input.subscriptionCurrency.toUpperCase() : "";
  const currency = code === "EUR" || code === "USD" || code === "BRL" ? code : null;
  if (!currency) return { basis: "unavailable" };
  return { basis: "subscription", currency, monthly: PLAN_AMOUNTS[currency].monthly, yearly: PLAN_AMOUNTS[currency].yearly };
}

/** True when a Price's default currency amount matches the plan. USD options are not visible here. */
export function priceMatchesPlan(price: { currency?: string | null; unit_amount?: number | null }, plan: BillingPlan): boolean {
  const currency = (price.currency ?? "").toUpperCase();
  if (currency !== "EUR" && currency !== "BRL" && currency !== "USD") return false;
  return price.unit_amount === PLAN_AMOUNTS[currency][plan];
}

export function billingPortalConfiguration(): string | undefined {
  return process.env.NODE_ENV === "production"
    ? process.env.STRIPE_LIVE_PORTAL_CONFIGURATION_ID
    : process.env.STRIPE_TEST_PORTAL_CONFIGURATION_ID;
}
