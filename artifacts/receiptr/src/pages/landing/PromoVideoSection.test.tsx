import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let reduced = false;
vi.mock("framer-motion", () => ({ useReducedMotion: () => reduced }));

import PromoVideoSection, { PROMO_READY, promoMedia } from "./PromoVideoSection";
import { LandingMediaProvider } from "./MarketingMedia";

function mockViewport(wide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  reduced = false;
  vi.restoreAllMocks();
});

describe("PromoVideoSection", () => {
  it("renders one muted, looping, inline 16:9 video on wide screens", () => {
    mockViewport(true);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<PromoVideoSection ready />);
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    const video = videos[0];
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("aria-label", "Receebo in 30 seconds");
    expect(video).toHaveAttribute("poster", promoMedia("receebo-promo-16x9-poster.webp"));
    expect(video.querySelector('source[type="video/webm"]')).toHaveAttribute("src", promoMedia("receebo-promo-16x9.webm"));
    expect(video.querySelector('source[type="video/mp4"]')).toHaveAttribute("src", promoMedia("receebo-promo-16x9.mp4"));
    expect(screen.getByTestId("promo-video-frame").className).toContain("aspect-video");
    // No IntersectionObserver in jsdom: falls back to starting right away.
    expect(play).toHaveBeenCalled();
  });

  it("uses only the 9:16 cut on narrow screens", () => {
    mockViewport(false);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<PromoVideoSection ready />);
    const html = container.innerHTML;
    expect(html).toContain("receebo-promo-9x16.mp4");
    expect(html).not.toContain("receebo-promo-16x9");
    expect(screen.getByTestId("promo-video-frame").className).toContain("aspect-[9/16]");
  });

  it("does not autoplay with reduced motion and offers a play button", () => {
    mockViewport(true);
    reduced = true;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<PromoVideoSection ready />);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play video: Receebo in 30 seconds" }));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("has an accessible sound toggle", () => {
    mockViewport(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<PromoVideoSection ready />);
    const toggle = screen.getByRole("button", { name: "Turn sound on" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByTestId("promo-video")).toHaveProperty("muted", false);
    expect(screen.getByRole("button", { name: "Turn sound off" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses v4 EU batch paths by default when ready", () => {
    mockViewport(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<PromoVideoSection ready />);
    expect(container.innerHTML).toContain("/marketing/receebo-real-app/v4/eu/receebo-promo-16x9.webm");
    expect(container.textContent).not.toMatch(/inglês|in English/);
  });

  it("uses the US batch inside the /us media provider", () => {
    mockViewport(false);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<LandingMediaProvider market="us"><PromoVideoSection ready /></LandingMediaProvider>);
    expect(container.innerHTML).toContain("/v4/us/receebo-promo-9x16.mp4");
    expect(container.innerHTML).toContain("/v4/us/receebo-promo-9x16-poster.webp");
  });

  it("every verified v4 batch defaults to ready", () => {
    expect(PROMO_READY).toEqual({ eu: true, us: true, br: true });
  });

  it.each(["eu", "us", "br"] as const)("plays the verified %s batch by default without a readiness override", (m) => {
    mockViewport(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<LandingMediaProvider market={m}><PromoVideoSection /></LandingMediaProvider>);
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(screen.queryByTestId("promo-still")).toBeNull();
    expect(screen.getByTestId("promo-video-section")).toHaveAttribute("data-promo-state", "video");
    expect(screen.getByTestId("promo-video")).toHaveAttribute("poster", promoMedia("receebo-promo-16x9-poster.webp", m));
    for (const ext of ["webm", "mp4"]) {
      expect(container.querySelector(`source[type="video/${ext}"]`)).toHaveAttribute("src", promoMedia(`receebo-promo-16x9.${ext}`, m));
    }
  });

  it.each(["eu", "us", "br"] as const)("missing %s promo shows a real still and requests no promo files", (m) => {
    mockViewport(true);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<LandingMediaProvider market={m}><PromoVideoSection ready={false} /></LandingMediaProvider>);
    expect(container.querySelector("video")).toBeNull();
    expect(container.innerHTML).not.toContain("receebo-promo");
    expect(container.innerHTML).not.toContain("/media/");
    expect(screen.getByTestId("promo-still").querySelector("img")).toHaveAttribute("src", promoMedia("library-phone.webp", m));
    expect(screen.getByTestId("promo-video-section")).toHaveAttribute("data-promo-state", "still");
    expect(play).not.toHaveBeenCalled();
    if (m === "us") expect(container.textContent).not.toContain("€");
  });
});
