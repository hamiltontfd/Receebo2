import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMetaPixel, metaPixelId, newEventId, trackMetaEvent } from "./metaPixel";

afterEach(() => {
  document.getElementById("meta-pixel")?.remove();
  delete window.fbq;
  delete window._fbq;
  vi.unstubAllEnvs();
});

describe("meta pixel", () => {
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
});
