import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { ATTRIBUTION_STORAGE_KEY, firstTouch, parseTouch, touchFromSearch, type AdTouch } from "@/lib/adAttribution";
import { CONSENT_STORAGE_KEY, effectiveConsent, parseConsent, consentRegion } from "@/lib/adConsent";
import { metaPixelId, newEventId, trackMetaEvent } from "@/lib/metaPixel";
import { useMarket } from "@/components/MarketProvider";
import { customFetch } from "@workspace/api-client-react";

const PURCHASE_KEY = "receebo:purchase-event";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function readConsent(path: string, market: string | null | undefined) {
  let stored = null;
  try { stored = parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY)); } catch { /* private mode */ }
  const gpc = typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  return effectiveConsent(stored, consentRegion(path, market), gpc);
}

function readTouch(): AdTouch | null {
  try { return parseTouch(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)); }
  catch { return null; }
}

function writeTouch(touch: AdTouch) {
  localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(touch));
  document.cookie = `${ATTRIBUTION_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(touch))}; Path=/; Max-Age=${90 * 24 * 60 * 60}; SameSite=Lax`;
}

/** Page views, first-touch campaign storage, registration and purchase events. */
export function AdsRuntime() {
  const { isSignedIn } = useAuth();
  const [path] = useLocation();
  const market = useMarket();
  const consent = readConsent(path, market.confirmed ? market.market : path.startsWith("/us") ? "US" : null);

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
    if (!isSignedIn || !consent.attribution) return;
    const touch = readTouch();
    if (!touch) return;
    const eventId = newEventId();
    void customFetch<{ created: boolean }>(`${base}/api/account/attribution`, {
      method: "POST",
      body: JSON.stringify({ ...touch, marketingConsent: consent.marketing, eventId }),
    }).then((result) => {
      if (result.created && consent.marketing) {
        trackMetaEvent({ name: "CompleteRegistration", eventId }, true);
      }
    }).catch(() => undefined);
  }, [isSignedIn, consent.attribution, consent.marketing]);

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

  return null;
}

export function rememberPurchaseEvent(meta: { eventId: string; value?: number | null; currency?: string | null } | undefined) {
  if (!meta?.eventId) return;
  try {
    sessionStorage.setItem(PURCHASE_KEY, JSON.stringify(meta));
  } catch { /* purchase pixel is skipped; the server event can still send */ }
}
