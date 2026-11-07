import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { MarketContext } from "@/components/MarketProvider";
import { useAppLocale } from "@/lib/locale";
import { isPlanCurrency, planCurrencyForMarket, planPrices, type PlanCurrency, type PlanKey } from "@/lib/planPricing";

/** Same key as BILLING_QUERY_KEY in hooks/useBilling.ts (kept literal so module mocks don't break pricing). */
const BILLING_KEY = ["billing", "subscription"] as const;

/**
 * Founding plan prices for this account/visitor, formatted for the app locale.
 * Signed-in: the server's billing currency wins, including an existing EUR
 * subscription that must not be shown as USD. Otherwise the saved or suggested
 * market decides (BR = BRL, US = USD, else EUR). On /us, a visitor who has not
 * chosen a market is shown the US offer. Works without providers (landing, tests).
 */
export function usePlanPrices(options?: { usOffer?: boolean }): {
  currency: PlanCurrency | null;
  prices: Record<PlanKey, string> | null;
  /** An in-force subscription whose currency could not be read. Not a market quote. */
  unavailable: boolean;
} {
  const locale = useAppLocale();
  const marketState = useContext(MarketContext);
  const market = marketState?.market ?? null;
  const client = useContext(QueryClientContext);
  const pricing = client?.getQueryData<{ pricing?: { currency?: string | null; basis?: string } }>(BILLING_KEY)?.pricing;
  if (pricing?.basis === "unavailable") return { currency: null, prices: null, unavailable: true };
  const server = pricing?.currency;
  const currency = isPlanCurrency(server) ? server
    : options?.usOffer && !marketState?.confirmed ? "USD"
    : planCurrencyForMarket(market);
  return { currency, prices: planPrices(currency, locale), unavailable: false };
}
