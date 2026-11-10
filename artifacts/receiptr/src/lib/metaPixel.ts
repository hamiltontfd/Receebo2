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

type Fbq = ((...args: unknown[]) => void) & { loaded?: boolean };

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
  const scriptId = "meta-pixel";
  if (!document.getElementById(scriptId)) {
    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  if (!window.fbq) {
    const queue: IArguments[] = [];
    const fbq = function fbq(this: unknown) {
      queue.push(arguments);
    } as Fbq;
    window.fbq = fbq;
    window._fbq = fbq;
  }
  window.fbq("init", id);
  window.fbq.loaded = true;
  return true;
}

/** Returns false without loading anything when the pixel id or consent is missing. */
export function trackMetaEvent(event: MetaEvent, allowed: boolean, id = metaPixelId()): boolean {
  if (!allowed || !loadMetaPixel(id) || !window.fbq) return false;
  const payload = event.value != null && event.currency
    ? { value: event.value, currency: event.currency }
    : {};
  window.fbq("track", event.name, payload, { eventID: event.eventId });
  return true;
}
