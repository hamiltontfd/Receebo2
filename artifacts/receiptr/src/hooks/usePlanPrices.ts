import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { MarketContext } from "@/components/MarketProvider";
import { useAppLocale } from "@/lib/locale";
import { isPlanCurrency, planCurrencyForMarket, planPrices, type PlanCurrency, type PlanKey } from "@/lib/planPricing";

/** Same key as BILLING_QUERY_KEY in hooks/useBilling.ts (kept literal so module mocks don't break pricing). */
const BILLING_KEY = ["billing", "subscription"] as const;

/**
 * Founding plan prices for this account/visitor, formatted for the app locale.
 * Signed-in: the server's billing currency (cached /billing/subscription) wins, so the
 * UI shows EUR when BRL prices are not configured; otherwise the market decides
 * (BR = BRL, else EUR). Works without Clerk/QueryClient/Market providers (landing, tests).
 */
export function usePlanPrices(): { currency: PlanCurrency; prices: Record<PlanKey, string> } {
  const locale = useAppLocale();
  const market = useContext(MarketContext)?.market ?? null;
  const client = useContext(QueryClientContext);
  const server = client?.getQueryData<{ pricing?: { currency?: string } }>(BILLING_KEY)?.pricing?.currency;
  const currency = isPlanCurrency(server) ? server : planCurrencyForMarket(market);
  return { currency, prices: planPrices(currency, locale) };
}
