import type { AppLocale } from "./locale";
import { formatLocaleMoney } from "./locale";

export type PlanKey = "monthly" | "yearly";
export type PlanCurrency = "EUR" | "BRL" | "USD";

/** Founding plan amounts (major units). US$3.50/month, US$28.50/year share the EUR Price. BR stays separate. */
export const PLAN_AMOUNTS: Record<PlanCurrency, Record<PlanKey, number>> = {
  EUR: { monthly: 2.99, yearly: 24.99 },
  BRL: { monthly: 20, yearly: 200 },
  USD: { monthly: 3.5, yearly: 28.5 },
};

/** BR is BRL. US is USD. PT and unknown stay EUR. */
export function planCurrencyForMarket(market: string | null | undefined): PlanCurrency {
  if (market === "BR") return "BRL";
  if (market === "US") return "USD";
  return "EUR";
}

export function isPlanCurrency(value: unknown): value is PlanCurrency {
  return value === "EUR" || value === "BRL" || value === "USD";
}

/** Prices use the UI locale and the plan currency, through the shared formatter. */
export function formatPlanPrice(plan: PlanKey, currency: PlanCurrency, locale: AppLocale): string {
  return formatLocaleMoney(PLAN_AMOUNTS[currency][plan], locale, currency);
}

export function planPrices(currency: PlanCurrency, locale: AppLocale): Record<PlanKey, string> {
  return { monthly: formatPlanPrice("monthly", currency, locale), yearly: formatPlanPrice("yearly", currency, locale) };
}
