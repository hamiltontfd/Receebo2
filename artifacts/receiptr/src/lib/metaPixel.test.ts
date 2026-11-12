import { afterEach, describe, expect, it, vi } from "vitest";
import { applyConsentPrivacy, loadMetaPixel, metaPixelId, newEventId, trackMetaEvent } from "./metaPixel";

afterEach(() => {
  document.getElementById("meta-pixel")?.remove();
  delete window.fbq;
  delete window._fbq;
  vi.unstubAllEnvs();
});

describe("meta pixel", () => {
  it.each(["FirstReceiptSaved", "AppReturned"] as const)("uses trackCustom for %s with an empty payload and shared id", (name) => {
    expect(trackMetaEvent({ name, eventId: "shared-id" }, true, "test-pixel")).toBe(true);
    expect(Array.from(window.fbq!.queue!.at(-1)!)).toEqual(["trackCustom", name, {}, { eventID: "shared-id" }]);
  });
  it("does nothing when the pixel id is unset or marketing is not allowed", () => {
    vi.stubEnv("VITE_META_PIXEL_ID", "");
    expect(metaPixelId("")).toBe("");
    expect(metaPixelId(undefined)).toBe("");
    expect(trackMetaEvent({ name: "PageView", eventId: "evt-1" }, true, "")).toBe(false);
    expect(trackMetaEvent({ name: "PageView", eventId: "evt-1" }, false, "123")).toBe(false);
    expect(document.getElementById("meta-pixel")).toBeNull();
  });

  it("uses one event id for the browser call", () => {
    const calls: unknown[][] = [];
    window.fbq = Object.assign((...args: unknown[]) => { calls.push(args); }, { loaded: true });
    const eventId = newEventId();
    expect(loadMetaPixel("123")).toBe(true);
    expect(trackMetaEvent({ name: "Purchase", eventId, value: 3.5, currency: "USD" }, true, "123")).toBe(true);
    expect(calls.some((call) => call[0] === "track" && call[1] === "Purchase" && (call[3] as { eventID: string }).eventID === eventId)).toBe(true);
  });

  it("exposes the official queue API before the remote SDK runs", () => {
    expect(loadMetaPixel("123")).toBe(true);
    const fbq = window.fbq!;
    expect(Array.isArray(fbq.queue)).toBe(true);
    expect(fbq.push).toBe(fbq);
    expect(fbq.version).toBe("2.0");
    expect(fbq.loaded).toBe(true);
    expect(window._fbq).toBe(fbq);
    expect(fbq.queue!.map(args => Array.from(args))).toEqual([["init", "123"]]);
    expect(trackMetaEvent({ name: "PageView", eventId: "queued-event" }, true, "123")).toBe(true);
    expect(fbq.queue!.map(args => Array.from(args))).toEqual([
      ["init", "123"],
      ["consent", "grant"],
      ["track", "PageView", {}, { eventID: "queued-event" }],
    ]);
    expect(document.querySelectorAll("#meta-pixel")).toHaveLength(1);
  });

  it("lets the SDK consume the queue and dispatches later calls through callMethod", () => {
    loadMetaPixel("123");
    const fbq = window.fbq!;
    const dispatch = vi.fn();
    // Model the SDK reading the public iterable and replacing queued dispatch.
    for (const args of fbq.queue!) dispatch(...Array.from(args));
    fbq.queue = [];
    fbq.callMethod = dispatch;
    fbq("consent", "revoke");
    fbq.push!("consent", "grant");
    expect(dispatch.mock.calls).toEqual([
      ["init", "123"], ["consent", "revoke"], ["consent", "grant"],
    ]);
    expect(dispatch.mock.contexts.slice(1)).toEqual([fbq, fbq]);
    expect(fbq.queue).toEqual([]);
  });

  it("removes the loader and injected Pixel scripts only when marketing is revoked", () => {
    window.fbq = Object.assign(vi.fn(), { loaded: true });
    const sources = [
      "https://connect.facebook.net/en_US/fbevents.js",
      "https://connect.facebook.net/signals/config/123?v=2",
      "https://connect.facebook.net/signals/plugins/identity.js",
      "https://pixel-assets.example/fbevents.js",
      "https://pixel-assets.example/fbevents.min.js",
      "https://app.example/app.js?ref=connect.facebook.net/fbevents.js",
      "https://connect.facebook.net.example/unrelated.js",
    ];
    const scripts = sources.map((src, i) => {
      const script = document.createElement("script");
      script.src = src;
      if (i === 0) script.id = "meta-pixel";
      (i % 2 ? document.body : document.head).appendChild(script);
      return script;
    });
    try {
      applyConsentPrivacy({ marketing: true, attribution: true });
      expect(scripts.every(script => script.isConnected)).toBe(true);
      expect(window.fbq).not.toHaveBeenCalled();

      applyConsentPrivacy({ marketing: false, attribution: true });
      expect(window.fbq).toHaveBeenCalledWith("consent", "revoke");
      expect(scripts.slice(0, 5).every(script => !script.isConnected)).toBe(true);
      expect(scripts.slice(5).every(script => script.isConnected)).toBe(true);
    } finally {
      scripts.forEach(script => script.remove());
    }
  });
});
