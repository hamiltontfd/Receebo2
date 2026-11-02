/**
 * Landing counts (US mode D): aggregate only. Sends { event, path, utmContent }
 * to the server, which adds 1 to a per-day counter. No cookie, no id, and
 * nothing is written to browser storage; utm_content is read from the URL each
 * time. Failures are ignored (measurement must never block the page).
 */
export type LandingPath = "/" | "/us";
export type LandingEvent = "landing_view" | "cta_click";

export function utmContentFromUrl(search = typeof window === "undefined" ? "" : window.location.search): string | undefined {
  try {
    const value = new URLSearchParams(search).get("utm_content")?.trim();
    return value ? value.slice(0, 80) : undefined;
  } catch { return undefined; }
}

export function sendLandingEvent(event: LandingEvent, path: LandingPath): void {
  try {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    void fetch(`${base}/api/landing/event`, {
      method: "POST", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, path, utmContent: utmContentFromUrl() }),
    }).catch(() => undefined);
  } catch { /* no fetch */ }
}
