import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { ATTRIBUTION_STORAGE_KEY, firstTouch, parseTouch, touchFromSearch, type AdTouch } from "@/lib/adAttribution";
import { useCookieConsent } from "@/lib/useCookieConsent";
import { applyConsentPrivacy, metaPixelId, newEventId, trackMetaEvent } from "@/lib/metaPixel";
import { customFetch, setResponseObserver } from "@workspace/api-client-react";
import { effectiveConsent, readStoredConsent } from "@/lib/adConsent";
import { trackMilestoneResponse } from "@/lib/metaLifecycle";

const PURCHASE_KEY = "receebo:purchase-event";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function readTouch(): AdTouch | null {
  try { return parseTouch(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)); }
  catch { return null; }
}

function writeTouch(touch: AdTouch) {
  localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(touch));
  document.cookie = `${ATTRIBUTION_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(touch))}; Path=/; Max-Age=${90 * 24 * 60 * 60}; SameSite=Lax; Secure`;
}

/** Page views, first-touch campaign storage, registration and purchase events. */
export function AdsRuntime() {
  const { isSignedIn, userId } = useAuth();
  const [path] = useLocation();
  const { consent, stored, region } = useCookieConsent();
  const [syncFailed, setSyncFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  const latest = useRef(consent);
  latest.current = consent;
  const account = useRef(userId);
  account.current = userId;
  const syncQueue = useRef(Promise.resolve());
  const currentRegion = useRef(region);
  currentRegion.current = region;

  useEffect(() => {
    setResponseObserver(response => {
      const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
      const allowed = effectiveConsent(readStoredConsent(), currentRegion.current, gpc).marketing;
      trackMilestoneResponse(response, allowed && !!account.current);
    });
    return () => setResponseObserver(undefined);
  }, []);

  useEffect(() => { applyConsentPrivacy(consent); }, [consent.marketing, consent.attribution]);

  useEffect(() => {
    if (!consent.attribution) return;
    const incoming = touchFromSearch(window.location.search);
    const next = firstTouch(readTouch(), incoming);
    if (next && JSON.stringify(next) !== JSON.stringify(readTouch())) writeTouch(next);
  }, [consent.attribution, path]);

  useEffect(() => {
    if (!consent.marketing || !metaPixelId()) return;
    trackMetaEvent({ name: "PageView", eventId: newEventId() }, true);
  }, [consent.marketing, path]);

  useEffect(() => {
    if (!isSignedIn || !userId || (region === "UNKNOWN" && !stored?.choice)) return;
    const touch = consent.attribution ? readTouch() : null;
    // Serialize changes so a slow earlier Accept cannot overwrite a later Reject.
    const marketingConsent = consent.marketing;
    syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
      if (account.current !== userId) return;
      if (touch) {
        await customFetch<{ created: boolean }>(`${base}/api/account/attribution`, {
          method: "POST", body: JSON.stringify({ ...touch, marketingConsent }),
        }).catch(() => null);
      }
      if (account.current !== userId) return;
      await customFetch(`${base}/api/account/attribution/consent`, {
        method: "PATCH", body: JSON.stringify({ marketingConsent }),
      });
      if (account.current === userId) setSyncFailed(false);
    }).catch(() => { if (account.current === userId) setSyncFailed(true); });
  }, [isSignedIn, userId, region, consent.attribution, consent.marketing, stored?.choice, retry]);

  useEffect(() => {
    if (!consent.marketing || !window.location.search.includes("checkout=success")) return;
    const raw = sessionStorage.getItem(PURCHASE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PURCHASE_KEY);
    try {
      const saved = JSON.parse(raw) as { eventId: string; value?: number; currency?: string };
      trackMetaEvent({ name: "Purchase", eventId: saved.eventId, value: saved.value, currency: saved.currency }, true);
      trackMetaEvent({ name: "Subscribe", eventId: saved.eventId, value: saved.value, currency: saved.currency }, true);
    } catch { /* ignore a broken handoff */ }
  }, [consent.marketing, path]);

  return syncFailed ? <p role="alert" className="fixed bottom-4 left-4 z-[90] max-w-sm rounded-xl border bg-background p-3 text-sm">
    Your browser choice is saved, but account marketing consent could not be updated.
    <button className="ml-2 underline" onClick={() => setRetry(value => value + 1)}>Retry</button>
  </p> : null;
}

export function rememberPurchaseEvent(meta: { eventId: string; value?: number | null; currency?: string | null } | undefined) {
  if (!meta?.eventId) return;
  try {
    sessionStorage.setItem(PURCHASE_KEY, JSON.stringify(meta));
  } catch { /* purchase pixel is skipped; the server event can still send */ }
}
