/**
 * Consumer-rules region for the signed-in account (US mode, Hamilton 2 Nov 2026).
 * There is no separate "region" setting: the rules follow the account market
 * (`user_preferences.market`, set from the server-side IP once, changeable in
 * Settings). US -> US rules; PT, BR or unknown -> PT/EU rules, exactly as today.
 */
import { useContext } from "react";
import { MarketContext } from "@/components/MarketProvider";

export type AccountRegion = "PT" | "US";

export function rulesRegionForMarket(market: string | null | undefined): AccountRegion {
  return market === "US" ? "US" : "PT";
}

/**
 * `ready` is false while the market is still loading, so a US account never
 * flashes PT rules. Only a saved choice (account, or a visitor's own choice)
 * changes rules; an unconfirmed suggestion never does. Outside the provider
 * (unit tests) it is PT and ready.
 */
export function useAccountRegion(): { region: AccountRegion; ready: boolean } {
  const m = useContext(MarketContext);
  if (!m) return { region: "PT", ready: true };
  const region = m.confirmed ? rulesRegionForMarket(m.market) : "PT";
  return { region, ready: m.confirmed || !m.loading };
}
