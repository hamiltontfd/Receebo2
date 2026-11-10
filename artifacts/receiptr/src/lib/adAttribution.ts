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
