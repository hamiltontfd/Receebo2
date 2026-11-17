import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { ATTRIBUTION_STORAGE_KEY, firstTouch, parseTouch, touchFromSearch, type AdTouch } from "@/lib/adAttribution";
import { useCookieConsent } from "@/lib/useCookieConsent";
import { applyConsentPrivacy, metaPixelId, newEventId, trackMetaEvent } from "@/lib/metaPixel";
import { customFetch, setResponseObserver } from "@workspace/api-client-react";
import { effectiveConsent, readStoredConsent } from "@/lib/adConsent";
import { trackMilestoneResponse } from "@/lib/metaLifecycle";
import { LEGAL_ACCEPTED_EVENT } from "./LegalConsentGate";
import { accountConsentNotApplicable, beginAccountConsentSync } from "@/lib/accountConsentSync";

const PURCHASE_KEY = "receebo:purchase-event";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
// Memory only until attribution is allowed. Survives the MarketScope remount
// at sign-in, but is never persisted before a jurisdiction/choice permits it.
let pendingTouch: AdTouch | null = null;
// Successful POSTs only, scoped to account and touch for this page session.
// Consent updates and retries must not repeat a successful attribution POST.
const syncedTouches = new Map<string, Set<string>>();

/** Explicit public-route allowlist: never measure receipt/search/account URLs. */
export function isPublicMetaPage(path: string): boolean {
  return ["/", "/us", "/pricing", "/privacy", "/cookies", "/terms"].includes(path.split(/[?#]/)[0]);
}

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
  const [touchKey, setTouchKey] = useState(() => JSON.stringify(readTouch()));
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(LEGAL_ACCEPTED_EVENT, refresh);
    return () => {
      clearTimeout(retryTimer.current);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(LEGAL_ACCEPTED_EVENT, refresh);
    };
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

  useEffect(() => {
    // UNKNOWN is not a rejection: stop marketing, but do not erase a previously
    // consented first touch while the new authenticated GeoIP request loads.
    applyConsentPrivacy({ ...consent, attribution: region === "UNKNOWN" && !stored?.choice ? true : consent.attribution });
  }, [consent.marketing, consent.attribution, region, stored?.choice]);

  useEffect(() => {
    const incoming = touchFromSearch(window.location.search);
    pendingTouch = firstTouch(pendingTouch, incoming);
    if (stored?.choice && !consent.attribution) { pendingTouch = null; return; }
    if (!consent.attribution) return;
    const next = firstTouch(readTouch(), pendingTouch);
    if (next && JSON.stringify(next) !== JSON.stringify(readTouch())) {
      writeTouch(next);
      setTouchKey(JSON.stringify(next));
    }
    pendingTouch = null;
  }, [consent.attribution, path, stored?.choice]);

  useEffect(() => {
    if (!consent.marketing || !metaPixelId() || !isPublicMetaPage(path)) return;
    trackMetaEvent({ name: "PageView", eventId: newEventId() }, true);
  }, [consent.marketing, path]);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    if (region === "UNKNOWN" && !stored?.choice) {
      accountConsentNotApplicable(userId);
      return;
    }
    const touch = consent.attribution ? readTouch() : null;
    const key = JSON.stringify(touch);
    // The capture effect just wrote a new touch: let its state update trigger
    // one sync, rather than also syncing the previous render.
    if (touch && key !== touchKey) return;
    // Serialize changes so a slow earlier Accept cannot overwrite a later Reject.
    const marketingConsent = consent.marketing;
    const consentSynced = beginAccountConsentSync(userId);
    syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
      if (account.current !== userId) return;
      // Exempt from the legal gate: record the current choice before trial
      // creation can emit a milestone, even while attribution must still wait.
      await customFetch(`${base}/api/account/attribution/consent`, {
        method: "PATCH", body: JSON.stringify({ marketingConsent }),
      });
      consentSynced();
      if (account.current !== userId) return;
      if (touch && latest.current.attribution && !syncedTouches.get(userId)?.has(key)) {
        await customFetch<{ created: boolean }>(`${base}/api/account/attribution`, {
          method: "POST", body: JSON.stringify({ ...touch, marketingConsent }),
        });
        const sent = syncedTouches.get(userId) ?? new Set<string>();
        sent.add(key);
        syncedTouches.set(userId, sent);
      }
      if (account.current === userId) { retryCount.current = 0; setSyncFailed(false); }
    }).catch((error: { status?: number }) => {
      if (account.current !== userId) return;
      // Expected before first acceptance; the acceptance event resumes sync.
      if (error.status === 428) {
        clearTimeout(retryTimer.current);
        setSyncFailed(false);
        return;
      }
      if ((!error.status || [401, 403].includes(error.status) || error.status >= 500) && retryCount.current < 4) {
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => setRetry(value => value + 1), 500 * 2 ** retryCount.current++);
      } else setSyncFailed(true);
    });
  }, [isSignedIn, userId, region, consent.attribution, consent.marketing, stored?.choice, retry, touchKey]);

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
