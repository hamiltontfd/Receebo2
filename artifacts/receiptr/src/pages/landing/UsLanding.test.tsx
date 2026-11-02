import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as R from "react";

vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, {
    get: (_t, tag: string) => ({ children, variants: _v, initial: _i, animate: _a, whileInView: _wv, viewport: _vp, transition: _tr, whileHover: _h, whileTap: _w, ...props }: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      R.createElement(tag, props, children as any),
  }),
}));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: false }) }));

import HeroSection from "./HeroSection";
import UsReturnsSection from "./UsReturnsSection";
import { MarketContext, type MarketState } from "@/components/MarketProvider";
import { utmContentFromUrl } from "@/lib/landingBeacon";

const market = (over: Partial<MarketState> = {}): MarketState => ({
  market: null, country: "US", source: "unknown", confirmed: false, loading: false, saving: false, error: null,
  choose: vi.fn(async () => undefined), retry: vi.fn(), ...over,
});
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
  window.history.replaceState(null, "", "/us?utm_source=meta&utm_content=bf-tv-1");
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); localStorage.clear(); sessionStorage.clear(); });

describe("/us landing (C + D)", () => {
  it("US hero copy and a clearly marked placeholder instead of the € screenshots", () => {
    render(<HeroSection variant="us" />);
    expect(screen.getByText("Returns, on time.")).toBeTruthy();
    expect(screen.getByText(/Best Buy, Target, Walmart, Amazon/)).toBeTruthy();
    expect(screen.getByTestId("us-hero-placeholder").textContent).toContain("Placeholder");
    expect(screen.queryByTestId("hero-phones")).toBeNull();
    expect(document.body.textContent).not.toContain("€");
  });

  it("CTA: aggregate cta_click with utm_content only, and an unchosen visitor becomes US", () => {
    const state = market();
    render(<MarketContext.Provider value={state}><HeroSection variant="us" /></MarketContext.Provider>);
    fireEvent.click(screen.getByTestId("link-hero-trial"));
    expect(state.choose).toHaveBeenCalledWith("US");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/landing\/event$/);
    expect(init.credentials).toBe("omit");
    expect(JSON.parse(String(init.body))).toEqual({ event: "cta_click", path: "/us", utmContent: "bf-tv-1" });
    // Nothing about the measurement is kept in the browser.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("a visitor who already chose a market keeps it; the default landing never sets US", () => {
    const chosen = market({ market: "PT", confirmed: true, source: "visitor" });
    render(<MarketContext.Provider value={chosen}><HeroSection variant="us" /></MarketContext.Provider>);
    fireEvent.click(screen.getByTestId("link-hero-trial"));
    expect(chosen.choose).not.toHaveBeenCalled();
    const fresh = market();
    render(<MarketContext.Provider value={fresh}><HeroSection /></MarketContext.Provider>);
    fireEvent.click(screen.getAllByTestId("link-hero-trial")[1]);
    expect(fresh.choose).not.toHaveBeenCalled();
    expect(JSON.parse(String((fetchSpy.mock.calls[1] as [string, RequestInit])[1].body)).path).toBe("/");
  });

  it("US returns section in every language, with the store-terms caveat", () => {
    render(<UsReturnsSection />);
    expect(screen.getByText("Know the last day to return it.")).toBeTruthy();
    expect(screen.getByText(/General information, not legal advice/)).toBeTruthy();
    const langs = vi.spyOn(navigator, "languages", "get");
    for (const [lang, text] of [["pt-PT", "Sabe qual é o último dia para devolver."], ["pt-BR", "Saiba qual é o último dia para devolver."]]) {
      langs.mockReturnValue([lang]);
      const { unmount } = render(<UsReturnsSection />);
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
    langs.mockRestore();
  });

  it("utm_content comes from the URL only", () => {
    expect(utmContentFromUrl("?utm_content=bf-tv-1")).toBe("bf-tv-1");
    expect(utmContentFromUrl("?utm_source=x")).toBeUndefined();
  });
});
