import type { AppLocale } from "./locale";
import { formatLocaleMoney } from "./locale";

export type PlanKey = "monthly" | "yearly";
export type PlanCurrency = "EUR" | "BRL";

/** Founding plan amounts (major units). BR = R$20/month, R$200/year (Hamilton, 4 Nov 2026). Server: lib/billingConfig.ts. */
export const PLAN_AMOUNTS: Record<PlanCurrency, Record<PlanKey, number>> = {
  EUR: { monthly: 2.99, yearly: 24.99 },
  BRL: { monthly: 20, yearly: 200 },
};

/** Only market BR is priced in BRL; PT, US and unknown stay EUR. */
export function planCurrencyForMarket(market: string | null | undefined): PlanCurrency {
  return market === "BR" ? "BRL" : "EUR";
}

export function isPlanCurrency(value: unknown): value is PlanCurrency {
  return value === "EUR" || value === "BRL";
}

/** en "€2.99" / "R$20.00" · pt-PT "2,99 €" · pt-BR "R$ 20,00" / "€ 2,99". */
export function formatPlanPrice(plan: PlanKey, currency: PlanCurrency, locale: AppLocale): string {
  return formatLocaleMoney(PLAN_AMOUNTS[currency][plan], locale, currency);
}

export function planPrices(currency: PlanCurrency, locale: AppLocale): Record<PlanKey, string> {
  return { monthly: formatPlanPrice("monthly", currency, locale), yearly: formatPlanPrice("yearly", currency, locale) };
}
