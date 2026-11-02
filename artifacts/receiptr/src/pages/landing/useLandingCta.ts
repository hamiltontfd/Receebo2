import { useContext } from "react";
import { MarketContext } from "@/components/MarketProvider";
import { sendLandingEvent, type LandingPath } from "@/lib/landingBeacon";

/**
 * CTA click on a landing page: counts an aggregate "cta_click" for the page,
 * and on /us a visitor who hasn't chosen a market yet is treated as choosing
 * US (an explicit click on the US page). Provider-safe: isSignedIn comes from
 * the caller and MarketContext may be absent (build-time public snapshot). The choice goes through the normal
 * visitor-market path, so it is adopted at sign-up only if the account has no
 * market, and stays editable in Settings.
 */
export function useLandingCta(path: LandingPath, isSignedIn = false): () => void {
  const market = useContext(MarketContext);
  return () => {
    sendLandingEvent("cta_click", path);
    if (path === "/us" && !isSignedIn && market && !market.confirmed) void market.choose("US");
  };
}
