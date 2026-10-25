import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DemoSection from "./DemoSection";
import { AppCapture, marketingMedia } from "./MarketingMedia";

// These assertions concern native media semantics, not animation timing.
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string) => {
      const Component = ({ children, variants: _variants, initial: _initial, whileInView: _whileInView, viewport: _viewport, whileHover: _whileHover, ...props }: Record<string, unknown>) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requireReact.createElement(tag, props, children as any);
      return Component;
    },
  }),
}));
import * as requireReact from "react";

describe("real-app marketing media", () => {
  it("provides all three manual clips, real posters and both video formats", () => {
    const { container } = render(<DemoSection />);
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(3);
    for (const [i, clip] of ["capture", "find", "protect"].entries()) {
      const video = videos[i];
      expect(video).toHaveAttribute("controls");
      expect(video).toHaveAttribute("playsinline");
      expect(video).toHaveAttribute("preload", "none");
      expect(video).not.toHaveAttribute("autoplay");
      expect(video).not.toHaveAttribute("loop");
      expect(video).toHaveAttribute("poster", marketingMedia(`${clip}-poster.webp`));
      expect(video.querySelector('source[type="video/webm"]')).toHaveAttribute("src", marketingMedia(`${clip}.webm`));
      expect(video.querySelector('source[type="video/mp4"]')).toHaveAttribute("src", marketingMedia(`${clip}.mp4`));
      const description = document.getElementById(video.getAttribute("aria-describedby")!);
      expect(description?.textContent?.length).toBeGreaterThan(80);
    }
    expect(screen.getByText(/Real app recordings with fictional sample data/)).toBeInTheDocument();
    cleanup();
  });

  it("reserves correct image dimensions and lazy-loads below-fold images", () => {
    render(<AppCapture file="protection.webp" alt="Portugal sample rights panel" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("width", "686");
    expect(img).toHaveAttribute("height", "312");
    expect(screen.getByText(/fictional sample data/)).toBeInTheDocument();
    cleanup();
  });
});
