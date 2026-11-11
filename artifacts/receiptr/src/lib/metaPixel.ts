/**
 * Browser Meta Pixel. Inert unless VITE_META_PIXEL_ID is set at build/dev start
 * and marketing consent allows it. The server Conversions API uses META_PIXEL_ID
 * and META_CAPI_ACCESS_TOKEN separately.
 */
export type MetaEventName = "PageView" | "CompleteRegistration" | "Purchase" | "Subscribe";

export type MetaEvent = {
  name: MetaEventName;
  eventId: string;
  value?: number;
  currency?: string;
};

type Fbq = ((...args: unknown[]) => void) & {
  loaded?: boolean;
  queue?: IArguments[];
  push?: Fbq;
  version?: string;
  callMethod?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export function metaPixelId(env?: string): string {
  const value = env ?? import.meta.env.VITE_META_PIXEL_ID;
  return typeof value === "string" ? value.trim() : "";
}

export function newEventId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function loadMetaPixel(id = metaPixelId()): boolean {
  if (!id || typeof document === "undefined") return false;
  if (window.fbq?.loaded) return true;
  if (!window.fbq) {
    // The remote SDK consumes this public queue, then installs callMethod.
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue!.push(arguments);
    };
    fbq.queue = [];
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
  }
  const scriptId = "meta-pixel";
  if (!document.getElementById(scriptId)) {
    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  window.fbq("init", id);
  window.fbq.loaded = true;
  return true;
}

/** Clear host-only and parent-domain cookies, including pre-Secure variants. */
export function deleteFirstPartyCookie(name: string) {
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = ["", host, `.${host}`];
  for (let i = 1; i < parts.length - 1; i++) domains.push(parts.slice(i).join("."), `.${parts.slice(i).join(".")}`);
  const paths = new Set(["/", ...window.location.pathname.split("/").map((_, i, all) => all.slice(0, i + 1).join("/") || "/")]);
  for (const domain of domains) for (const path of paths) for (const secure of ["", "; Secure"]) {
    document.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${path}${domain ? `; Domain=${domain}` : ""}; SameSite=Lax${secure}`;
  }
}

export function applyConsentPrivacy(consent: { marketing: boolean; attribution: boolean }) {
  if (!consent.marketing) {
    window.fbq?.("consent", "revoke");
    deleteFirstPartyCookie("_fbp");
    deleteFirstPartyCookie("_fbc");
    document.getElementById("meta-pixel")?.remove();
  }
  if (!consent.attribution) {
    try { localStorage.removeItem("receebo:ad-attribution"); } catch { /* no storage */ }
    deleteFirstPartyCookie("receebo:ad-attribution");
  }
}

/** Returns false without loading anything when the pixel id or consent is missing. */
export function trackMetaEvent(event: MetaEvent, allowed: boolean, id = metaPixelId()): boolean {
  if (!allowed || !loadMetaPixel(id) || !window.fbq) return false;
  window.fbq("consent", "grant");
  const payload = event.value != null && event.currency
    ? { value: event.value, currency: event.currency }
    : {};
  window.fbq("track", event.name, payload, { eventID: event.eventId });
  return true;
}
