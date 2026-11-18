import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptAll, consentCookie, consentCountry, consentRegion, effectiveConsent, emptyConsent, parseConsent } from "./adConsent";

describe("ad consent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the supplied country without a search string or browser globals", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", undefined);
    expect(() => consentCountry("PT")).not.toThrow();
    expect(consentCountry("PT")).toBe("PT");
    expect(consentCountry("BR", undefined, true)).toBe("BR");
    expect(consentCountry(null)).toBeNull();
    expect(consentCountry("PT", "?dev_country=US", true)).toBe("US");
    expect(consentCountry("PT", "?dev_country=US", false)).toBe("PT");
  });

  it("allows a valid DEV country override from browser location or an explicit search", () => {
    vi.stubGlobal("window", { location: { search: "?dev_country=US" } });
    expect(consentCountry("PT", undefined, true)).toBe("US");
    expect(consentCountry("PT", undefined, false)).toBe("PT");
    expect(consentCountry("PT", "?dev_country=br", true)).toBe("BR");
    expect(consentCountry("PT", "?dev_country=EUROPE", true)).toBe("PT");
    expect(consentCountry("PT", "?dev_country=", true)).toBe("PT");
  });

  it("ignores country overrides in production mode, including browser location", () => {
    vi.stubGlobal("window", { location: { search: "?dev_country=US" } });
    expect(consentCountry("PT", undefined, false)).toBe("PT");
    expect(consentCountry(null, "?dev_country=US", false)).toBeNull();
    expect(consentCountry("US", "?dev_country=PT", false)).toBe("US");
  });

  it("uses the Vite DEV guard by default", () => {
    expect(consentCountry("PT", "?dev_country=US")).toBe(import.meta.env.DEV ? "US" : "PT");
  });

  it("uses the country alone: EU/EEA/GB/CH/BR opt in regardless of /us or chosen market", () => {
    for (const code of ["PT", "DE", "IS", "LI", "NO", "GB", "CH", "BR", "JP"]) {
      expect(consentRegion(code)).toBe("EU");
      expect(effectiveConsent(null, consentRegion(code), false).marketing).toBe(false);
    }
    expect(consentRegion("US")).toBe("US");
    expect(consentRegion(null)).toBe("UNKNOWN");
    expect(effectiveConsent(acceptAll(), "UNKNOWN", false).marketing).toBe(true);
    expect(consentCountry("PT", "?dev_country=US", false)).toBe("PT");
    expect(consentCountry(null, "?dev_country=US", true)).toBe("US");
    expect(consentCountry("US", "?dev_country=PT", true)).toBe("PT");
  });

  it("keeps opt-in regions off without a choice and uses GPC only for US defaults", () => {
    expect(effectiveConsent(null, "EU", false).marketing).toBe(false);
    expect(effectiveConsent(null, "EU", false).attribution).toBe(false);
    expect(effectiveConsent(null, "US", false).marketing).toBe(true);
    expect(effectiveConsent(null, "US", true).marketing).toBe(false);
    expect(effectiveConsent(acceptAll(), "US", true).marketing).toBe(true);
    expect(effectiveConsent(emptyConsent(), "US", false).marketing).toBe(false);
  });

  it("honors saved Accept, Reject and Preferences before country and GPC defaults", () => {
    const choices = [
      acceptAll(),
      emptyConsent(),
      { ...acceptAll(), choice: "preferences" as const },
      { ...acceptAll(), choice: "preferences" as const, marketing: false },
    ];
    for (const region of ["UNKNOWN", "EU", "US"] as const) {
      for (const gpc of [false, true]) {
        for (const stored of choices) {
          expect(effectiveConsent(stored, region, gpc)).toBe(stored);
        }
      }
    }
  });

  it("keeps every non-essential category off for an unknown country without a choice", () => {
    for (const gpc of [false, true]) {
      expect(effectiveConsent(null, "UNKNOWN", gpc)).toMatchObject({
        essential: true, preferences: false, attribution: false, marketing: false,
      });
      expect(effectiveConsent(null, "EU", gpc)).toMatchObject({
        preferences: false, attribution: false, marketing: false,
      });
    }
    expect(effectiveConsent(null, "US", true)).toMatchObject({
      preferences: true, attribution: true, marketing: false,
    });
    expect(effectiveConsent(null, "US", false)).toMatchObject({
      preferences: true, attribution: true, marketing: true,
    });
  });

  it("marks the consent cookie Secure even for a rejection", () => {
    expect(consentCookie(emptyConsent())).toMatch(/; Secure$/);
  });

  it("ignores a stored value that is not a real choice", () => {
    expect(parseConsent("{\"marketing\":true}")).toBeNull();
    expect(parseConsent(JSON.stringify(acceptAll("2026-11-09T00:00:00.000Z")))?.choice).toBe("accept");
  });
});
