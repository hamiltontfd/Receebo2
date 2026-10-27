import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let reduced = false;
vi.mock("framer-motion", () => ({ useReducedMotion: () => reduced }));

import PromoVideoSection, { promoMedia } from "./PromoVideoSection";

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
    const { container } = render(<PromoVideoSection />);
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
    const { container } = render(<PromoVideoSection />);
    const html = container.innerHTML;
    expect(html).toContain("receebo-promo-9x16.mp4");
    expect(html).not.toContain("receebo-promo-16x9");
    expect(screen.getByTestId("promo-video-frame").className).toContain("aspect-[9/16]");
  });

  it("does not autoplay with reduced motion and offers a play button", () => {
    mockViewport(true);
    reduced = true;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<PromoVideoSection />);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play video: Receebo in 30 seconds" }));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("has an accessible sound toggle", () => {
    mockViewport(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<PromoVideoSection />);
    const toggle = screen.getByRole("button", { name: "Turn sound on" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByTestId("promo-video")).toHaveProperty("muted", false);
    expect(screen.getByRole("button", { name: "Turn sound off" })).toHaveAttribute("aria-pressed", "true");
  });
});
