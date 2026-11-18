/** First-touch ad parameters. Later visits do not replace an unexpired touch. */
export type AdTouch = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  capturedAt: string;
};

export const ATTRIBUTION_STORAGE_KEY = "receebo:ad-attribution";
export const ATTRIBUTION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"] as const;
const MAX = 120;

function clip(value: string | null): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.slice(0, MAX);
}

export function touchFromSearch(search: string, now = new Date()): AdTouch | null {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`); }
  catch { return null; }
  const utmSource = clip(params.get("utm_source"));
  const utmMedium = clip(params.get("utm_medium"));
  const utmCampaign = clip(params.get("utm_campaign"));
  const utmContent = clip(params.get("utm_content"));
  const utmTerm = clip(params.get("utm_term"));
  const fbclid = clip(params.get("fbclid"));
  if (!utmSource && !utmMedium && !utmCampaign && !utmContent && !utmTerm && !fbclid) return null;
  const touch: AdTouch = { capturedAt: now.toISOString() };
  if (utmSource) touch.utmSource = utmSource;
  if (utmMedium) touch.utmMedium = utmMedium;
  if (utmCampaign) touch.utmCampaign = utmCampaign;
  if (utmContent) touch.utmContent = utmContent;
  if (utmTerm) touch.utmTerm = utmTerm;
  if (fbclid) {
    touch.fbclid = fbclid;
    touch.fbc = `fb.1.${now.getTime()}.${fbclid}`;
  }
  return touch;
}

export function parseTouch(raw: string | null): AdTouch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AdTouch>;
    if (!value.capturedAt || Number.isNaN(Date.parse(value.capturedAt))) return null;
    return value as AdTouch;
  } catch {
    return null;
  }
}

export function firstTouch(existing: AdTouch | null, incoming: AdTouch | null, now = Date.now()): AdTouch | null {
  const fresh = existing && now - Date.parse(existing.capturedAt) < ATTRIBUTION_MAX_AGE_MS ? existing : null;
  return fresh ?? incoming;
}

/** Called in the CTA click, before the router or Clerk can navigate. */
export const ATTRIBUTION_CAPTURED_EVENT = "receebo:attribution-captured";

export function captureAllowedFirstTouch(allowed: boolean, search: string): AdTouch | null {
  if (!allowed) return null;
  try {
    const previous = parseTouch(localStorage.getItem(ATTRIBUTION_STORAGE_KEY));
    const next = firstTouch(previous, touchFromSearch(search));
    if (next) {
      localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next));
      document.cookie = `${ATTRIBUTION_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(next))}; Path=/; Max-Age=${ATTRIBUTION_MAX_AGE_MS / 1000}; SameSite=Lax; Secure`;
      if (JSON.stringify(previous) !== JSON.stringify(next)) window.dispatchEvent(new Event(ATTRIBUTION_CAPTURED_EVENT));
    }
    return next;
  } catch { return null; }
}

export function campaignSignUpHref(search = typeof window === "undefined" ? "" : window.location.search): string {
  const incoming = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of CAMPAIGN_PARAMS) {
    const value = incoming.get(key);
    if (value) kept.set(key, value);
  }
  return `/sign-up${kept.size ? `?${kept}` : ""}`;
}
