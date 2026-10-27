import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import DemoSection from "./DemoSection";
import { AppCapture, marketingMedia } from "./MarketingMedia";

// These assertions concern native media semantics, not animation timing.
vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, {
    get: (_target, tag: string) => {
      const Component = ({ children, variants: _variants, initial: _initial, animate: _animate, transition: _transition, whileInView: _whileInView, viewport: _viewport, whileHover: _whileHover, ...props }: Record<string, unknown>) =>
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
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    expect(container.querySelectorAll("video")).toHaveLength(0);
    for (const clip of ["capture", "find", "protect"]) {
      fireEvent.click(screen.getByRole("button", { name: `Play ${clip[0].toUpperCase()}${clip.slice(1)} demo` }));
      const dialog = screen.getByRole("dialog");
      const video = dialog.querySelector("video")!;
      expect(video).toHaveAttribute("controls");
      expect(video).toHaveAttribute("playsinline");
      expect(video).toHaveAttribute("preload", "metadata");
      expect(video).toHaveAttribute("autoplay");
      expect(video).not.toHaveAttribute("loop");
      expect(video).toHaveAttribute("poster", marketingMedia(`${clip}-poster.webp`));
      expect(video.querySelector('source[type="video/webm"]')).toHaveAttribute("src", marketingMedia(`${clip}.webm`));
      expect(video.querySelector('source[type="video/mp4"]')).toHaveAttribute("src", marketingMedia(`${clip}.mp4`));
      const description = document.getElementById(dialog.getAttribute("aria-describedby")!);
      expect(description?.textContent?.length).toBeGreaterThan(80);
      fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    }
    expect(screen.getByText(/Real app recordings with fictional sample data/)).toBeInTheDocument();
    cleanup();
  });

  it("reserves correct image dimensions and lazy-loads below-fold images", () => {
    render(<AppCapture file="protection.webp" alt="Portugal sample rights panel" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("width", "686");
    expect(img).toHaveAttribute("height", "360");
    expect(screen.getByText(/fictional sample data/)).toBeInTheDocument();
    cleanup();
  });

  it.each([
    ["protection.webp", "Consumer rights panel", "420"],
    ["original-receipt.webp", "Full original receipt", "420"],
  ])("gives %s outer spacing and an inset image surface without cropping", (file, alt, height) => {
    render(<AppCapture file={file} alt={alt} className={`h-[${height}px]`} caption="Sample screen caption" />);
    const img = screen.getByRole("img", { name: alt });
    const figure = img.closest("figure")!;
    expect(figure).toHaveClass("p-6", "sm:p-8", "gap-5", "min-w-0");
    expect(img).toHaveClass("p-4", "sm:p-5", "object-contain", "min-h-0");
    expect(img).not.toHaveClass("object-cover");
    expect(img).toHaveAttribute("src", marketingMedia(file));
    expect(figure.querySelector("figcaption")).toHaveClass("shrink-0");
    expect(screen.getByText("Sample screen caption")).toBeVisible();
    cleanup();
  });
});
