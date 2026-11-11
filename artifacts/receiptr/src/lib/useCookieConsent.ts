import { useContext, useEffect, useState } from "react";
import { MarketContext } from "@/components/MarketProvider";
import { CONSENT_CHANGED, CONSENT_STORAGE_KEY, consentCountry, consentRegion, effectiveConsent, readStoredConsent } from "./adConsent";

/** Same-page saves and cross-tab changes are observable without navigation. */
export function useCookieConsent() {
  const market = useContext(MarketContext);
  const [stored, setStored] = useState(readStoredConsent);
  useEffect(() => {
    const refresh = () => setStored(readStoredConsent());
    const storage = (event: StorageEvent) => { if (!event.key || event.key === CONSENT_STORAGE_KEY) refresh(); };
    window.addEventListener(CONSENT_CHANGED, refresh);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(CONSENT_CHANGED, refresh);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const region = consentRegion(consentCountry(market?.country));
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  return { stored, region, consent: effectiveConsent(stored, region, gpc) };
}
