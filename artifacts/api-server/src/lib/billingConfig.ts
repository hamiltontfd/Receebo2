import { logger } from "./logger";

export type BillingPlan = "monthly" | "yearly";
export type BillingCurrency = "EUR" | "BRL";

/** Founding plan amounts in minor units, per currency (Hamilton, 4 Nov 2026: BR = R$20/month, R$200/year). */
export const PLAN_AMOUNTS: Record<BillingCurrency, Record<BillingPlan, number>> = {
  EUR: { monthly: 299, yearly: 2499 },
  BRL: { monthly: 2000, yearly: 20000 },
};

/** Account market -> billing currency. Only BR is priced in BRL; PT, US and unknown stay EUR. */
export function billingCurrencyForMarket(market: unknown): BillingCurrency {
  return market === "BR" ? "BRL" : "EUR";
}

function envPriceId(plan: BillingPlan, suffix: string): string | undefined {
  const mode = process.env.NODE_ENV === "production" ? "LIVE" : "TEST";
  const interval = plan.toUpperCase();
  return process.env[`STRIPE_${mode}_${interval}_PRICE_ID${suffix}`] ||
    process.env[`STRIPE_${interval}_PRICE_ID${suffix}`] || undefined;
}

/**
 * Price id for a plan. BR accounts use STRIPE_{TEST|LIVE}_{MONTHLY|YEARLY}_PRICE_ID_BRL;
 * when that variable is missing they fall back to the EUR price (logged).
 */
export function billingPriceId(plan: BillingPlan, market?: unknown): string | undefined {
  if (billingCurrencyForMarket(market) === "BRL") {
    const brl = envPriceId(plan, "_BRL");
    if (brl) return brl;
    logger.warn({ plan }, "billing: BRL price id not configured; falling back to EUR");
  }
  return envPriceId(plan, "");
}

/** Currency actually used for a market (EUR when the BRL price is not configured). */
export function effectiveBillingCurrency(market: unknown): BillingCurrency {
  return billingCurrencyForMarket(market) === "BRL" && envPriceId("monthly", "_BRL") && envPriceId("yearly", "_BRL")
    ? "BRL" : "EUR";
}

/** True when a Stripe price matches the configured plan amount for its currency. */
export function priceMatchesPlan(price: { currency?: string | null; unit_amount?: number | null }, plan: BillingPlan): boolean {
  const currency = (price.currency ?? "").toUpperCase();
  if (currency !== "EUR" && currency !== "BRL") return false;
  return price.unit_amount === PLAN_AMOUNTS[currency][plan];
}

export function billingPortalConfiguration(): string | undefined {
  return process.env.NODE_ENV === "production"
    ? process.env.STRIPE_LIVE_PORTAL_CONFIGURATION_ID
    : process.env.STRIPE_TEST_PORTAL_CONFIGURATION_ID;
}
