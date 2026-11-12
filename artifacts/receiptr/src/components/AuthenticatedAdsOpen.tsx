import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useCookieConsent } from "@/lib/useCookieConsent";
import { recordAuthenticatedOpen } from "@/lib/metaLifecycle";

/** Mounted only after authentication, legal consent and the app access gates. */
export function AuthenticatedAdsOpen() {
  const { userId } = useAuth();
  const { consent } = useCookieConsent();
  useEffect(() => {
    if (userId) recordAuthenticatedOpen(userId, consent.marketing);
  }, [userId, consent.marketing]);
  return null;
}
