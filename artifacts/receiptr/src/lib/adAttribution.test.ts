import { describe, expect, it } from "vitest";
import { ATTRIBUTION_MAX_AGE_MS, firstTouch, touchFromSearch } from "./adAttribution";

describe("ad attribution", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");

  it("reads the campaign fields and builds an fbc from fbclid", () => {
    const touch = touchFromSearch("?utm_source=meta&utm_medium=paid&utm_campaign=nov&utm_content=tv&utm_term=receipt&fbclid=click1", now);
    expect(touch).toMatchObject({
      utmSource: "meta", utmMedium: "paid", utmCampaign: "nov", utmContent: "tv", utmTerm: "receipt", fbclid: "click1",
    });
    expect(touch?.fbc).toBe(`fb.1.${now.getTime()}.click1`);
  });

  it("keeps the first touch and replaces only an expired one", () => {
    const first = touchFromSearch("?utm_source=meta", now)!;
    const later = touchFromSearch("?utm_source=other", now)!;
    expect(firstTouch(first, later, now.getTime())?.utmSource).toBe("meta");
    expect(firstTouch(null, later)?.utmSource).toBe("other");
    const stale = { ...first, capturedAt: new Date(now.getTime() - ATTRIBUTION_MAX_AGE_MS - 1000).toISOString() };
    expect(firstTouch(stale, later, now.getTime())?.utmSource).toBe("other");
  });

  it("ignores a landing URL with no campaign parameters", () => {
    expect(touchFromSearch("?checkout=success", now)).toBeNull();
  });
});
