import { describe, expect, it } from "vitest";
import { acceptAll, consentRegion, effectiveConsent, emptyConsent, parseConsent } from "./adConsent";

describe("ad consent", () => {
  it("treats /us and a US account as the opt-out region", () => {
    expect(consentRegion("/us", null)).toBe("US");
    expect(consentRegion("/search", "US")).toBe("US");
    expect(consentRegion("/", "PT")).toBe("EU");
    expect(consentRegion("/search", null)).toBe("EU");
  });

  it("keeps EU non-essential storage off until a choice, and honors Global Privacy Control in the US", () => {
    expect(effectiveConsent(null, "EU", false).marketing).toBe(false);
    expect(effectiveConsent(null, "EU", false).attribution).toBe(false);
    expect(effectiveConsent(null, "US", false).marketing).toBe(true);
    expect(effectiveConsent(null, "US", true).marketing).toBe(false);
    expect(effectiveConsent(acceptAll(), "US", true).marketing).toBe(true);
    expect(effectiveConsent(emptyConsent(), "US", false).marketing).toBe(false);
  });

  it("ignores a stored value that is not a real choice", () => {
    expect(parseConsent("{\"marketing\":true}")).toBeNull();
    expect(parseConsent(JSON.stringify(acceptAll("2026-11-09T00:00:00.000Z")))?.choice).toBe("accept");
  });
});
