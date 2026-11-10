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
});
