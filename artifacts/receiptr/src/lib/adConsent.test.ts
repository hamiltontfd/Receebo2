import { describe, expect, it } from "vitest";
import { acceptAll, consentCookie, consentCountry, consentRegion, effectiveConsent, emptyConsent, parseConsent } from "./adConsent";

describe("ad consent", () => {
  it("uses the country alone: EU/EEA/GB/CH/BR opt in regardless of /us or chosen market", () => {
    for (const code of ["PT", "DE", "IS", "LI", "NO", "GB", "CH", "BR", "JP"]) {
      expect(consentRegion(code)).toBe("EU");
      expect(effectiveConsent(null, consentRegion(code), false).marketing).toBe(false);
    }
    expect(consentRegion("US")).toBe("US");
    expect(consentRegion(null)).toBe("UNKNOWN");
    expect(effectiveConsent(acceptAll(), "UNKNOWN", false).marketing).toBe(false);
    expect(consentCountry("PT", "?dev_country=US", false)).toBe("PT");
    expect(consentCountry(null, "?dev_country=US", true)).toBe("US");
    expect(consentCountry("US", "?dev_country=PT", true)).toBe("PT");
  });

  it("keeps EU non-essential storage off until a choice, and honors Global Privacy Control in the US", () => {
    expect(effectiveConsent(null, "EU", false).marketing).toBe(false);
    expect(effectiveConsent(null, "EU", false).attribution).toBe(false);
    expect(effectiveConsent(null, "US", false).marketing).toBe(true);
    expect(effectiveConsent(null, "US", true).marketing).toBe(false);
    expect(effectiveConsent(acceptAll(), "US", true).marketing).toBe(false);
    expect(effectiveConsent(emptyConsent(), "US", false).marketing).toBe(false);
  });

  it("marks the consent cookie Secure even for a rejection", () => {
    expect(consentCookie(emptyConsent())).toMatch(/; Secure$/);
  });

  it("ignores a stored value that is not a real choice", () => {
    expect(parseConsent("{\"marketing\":true}")).toBeNull();
    expect(parseConsent(JSON.stringify(acceptAll("2026-11-09T00:00:00.000Z")))?.choice).toBe("accept");
  });
});
