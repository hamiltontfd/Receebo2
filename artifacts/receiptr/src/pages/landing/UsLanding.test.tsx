import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as R from "react";

vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  MotionConfig: ({ children }: { children: R.ReactNode }) => children,
  AnimatePresence: ({ children }: { children: R.ReactNode }) => children,
  motion: new Proxy({}, {
    get: (_t, tag: string) => ({ children, variants: _v, initial: _i, animate: _a, whileInView: _wv, viewport: _vp, transition: _tr, whileHover: _h, whileTap: _w, ...props }: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      R.createElement(tag, props, children as any),
  }),
}));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: false }) }));

import HeroSection from "./HeroSection";
import UsReturnsSection from "./UsReturnsSection";
import ComparisonSection from "./ComparisonSection";
import PricingSection from "./PricingSection";
import { MarketContext, type MarketState } from "@/components/MarketProvider";
import { utmContentFromUrl } from "@/lib/landingBeacon";
import { LandingContent } from "../landing";

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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); localStorage.clear(); sessionStorage.clear(); });

describe("/us landing (C + D)", () => {
  it.each([
    ["en-US", "US", "us"],
    ["en-US", "PT", undefined],
    ["pt-PT", "PT", undefined],
    ["pt-BR", "BR", undefined],
  ] as const)("footer wraps whole, tappable labels for %s / %s", (language, selectedMarket, variant) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([language]);
    const { unmount } = render(
      <MarketContext.Provider value={market({ market: selectedMarket, country: selectedMarket })}>
        <LandingContent variant={variant} />
      </MarketContext.Provider>,
    );
    const links = screen.getByTestId("landing-footer-links");
    expect(links).toHaveClass("flex-wrap", "w-full", "min-w-0", "gap-y-2");
    for (const tag of ["a", "button"]) {
      for (const rule of ["inline-flex", "min-h-11", "shrink-0", "items-center", "whitespace-nowrap", "break-normal", "[overflow-wrap:normal]"]) {
        expect(links).toHaveClass(`[&>${tag}]:${rule}`);
      }
      expect(links.querySelector(tag)).not.toBeNull();
    }
    const footer = links.closest("footer")!;
    expect(footer.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(footer.querySelector('a[href="/sign-in"]')).not.toBeNull();
    expect(footer.querySelector(`a[href="${variant === "us" ? "/cookies?region=us" : "/cookies"}"]`)).not.toBeNull();
    expect(links.textContent?.includes("Do Not Sell or Share My Personal Information")).toBe(variant === "us");
    unmount();
    vi.restoreAllMocks();
  });

  it("US hero stays on the US batch even when the market context says BR", () => {
    render(<MarketContext.Provider value={market({ market: "BR" })}><HeroSection variant="us" /></MarketContext.Provider>);
    expect(screen.getByTestId("img-hero-library-phone").getAttribute("src")).toContain("/v4/us/");
  });

  it("US hero uses the real fictional sample screens, not the € captures or the placeholder", () => {
    render(<HeroSection variant="us" />);
    expect(screen.getByText("Returns, on time.")).toBeTruthy();
    expect(screen.getByText(/Best Buy, Target, Walmart, Amazon/)).toBeTruthy();
    expect(screen.queryByTestId("us-hero-placeholder")).toBeNull();
    expect(screen.queryByTestId("hero-phones")).toBeNull();
    for (const [id, file] of [["img-hero-library-phone", "library-phone.webp"], ["img-hero-receipt-phone", "receipt-phone.webp"]]) {
      const img = screen.getByTestId(id);
      expect(img.getAttribute("src")).toContain(`/marketing/receebo-real-app/v4/us/${file}`);
      expect(img).toHaveAttribute("width", "780");
      expect(img).toHaveAttribute("height", "1688");
      expect(img.style.marginTop).toBe(`${-(32 / 390) * 100}%`);
    }
    expect(document.body.innerHTML).not.toContain("marketing/us/");
    expect(screen.getByTestId("us-hero-phones").textContent).toMatch(/Northwind Supply/);
    expect(screen.getByTestId("us-hero-phones").textContent).toMatch(/not a US legal guarantee/);
    expect(screen.getByText("See it in action").closest("a")).toHaveAttribute("href", "#demo");
    expect(document.body.textContent).not.toContain("€");
    expect(document.body.textContent).not.toContain("Placeholder");
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

  it("drops only the consumer-rights comparison row and shows the USD founding prices", () => {
    const us = render(<ComparisonSection variant="us" />);
    expect(screen.queryByText("Consumer rights info")).toBeNull();
    expect(screen.getByText("Warranty tracking")).toBeTruthy();
    us.unmount();
    const home = render(<ComparisonSection />);
    expect(screen.getByText("Consumer rights info")).toBeTruthy();
    home.unmount();
    render(<PricingSection variant="us" />);
    expect(screen.getByText("$3.50")).toBeTruthy();
    expect(screen.getByText("$28.50")).toBeTruthy();
  });

  it("utm_content comes from the URL only", () => {
    expect(utmContentFromUrl("?utm_content=bf-tv-1")).toBe("bf-tv-1");
    expect(utmContentFromUrl("?utm_source=x")).toBeUndefined();
  });
});
