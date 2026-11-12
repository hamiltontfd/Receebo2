// @vitest-environment node
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketContext, type MarketState } from "@/components/MarketProvider";
import { consentCountry } from "./adConsent";
import { useCookieConsent } from "./useCookieConsent";

afterEach(() => vi.unstubAllGlobals());

describe("cookie consent prerender", () => {
  it.each(["PT", "BR", "US", null])("resolves consent without browser globals for %s", (country) => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("localStorage", undefined);
    const market: MarketState = {
      market: null, country, source: "unknown", confirmed: false,
      loading: false, saving: false, error: null,
      choose: async () => {}, retry: () => {},
    };
    let resolved: ReturnType<typeof useCookieConsent> | undefined;
    function Probe() {
      resolved = useCookieConsent();
      return null;
    }
    expect(() => renderToString(
      createElement(MarketContext.Provider, { value: market }, createElement(Probe)),
    )).not.toThrow();
    expect(consentCountry(country)).toBe(country);
    expect(resolved?.region).toBe(country === "US" ? "US" : country ? "EU" : "UNKNOWN");
    expect(resolved?.stored).toBeNull();
    // With no navigator, GPC defaults to false: only US defaults allow marketing.
    expect(resolved?.consent.marketing).toBe(country === "US");
  });
});
