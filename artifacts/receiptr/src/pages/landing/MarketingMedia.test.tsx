import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import DemoSection from "./DemoSection";
import { AppCapture, LandingMediaProvider, marketingMedia, type MediaMarket } from "./MarketingMedia";
import WhyReceeboSection from "./WhyReceeboSection";
import ConsumerProtectionSection from "./ConsumerProtectionSection";
import { MarketContext, type MarketState } from "@/components/MarketProvider";

// These assertions concern native media semantics, not animation timing.
vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children: unknown }) => children,
  motion: new Proxy({}, {
    get: (_target, tag: string) => {
      const Component = ({ children, variants: _variants, initial: _initial, animate: _animate, transition: _transition, whileInView: _whileInView, viewport: _viewport, whileHover: _whileHover, exit: _exit, custom: _custom, ...props }: Record<string, unknown>) =>
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
    expect(img).toHaveAttribute("width", "1070");
    expect(img).toHaveAttribute("height", "2190");
    expect(screen.getByText(/fictional sample data/)).toBeInTheDocument();
    cleanup();
  });

  it.each([
    ["protection.webp", "Consumer rights panel", "420"],
    ["show-to-store.webp", "Full-screen Show to store view", "420"],
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

  it("resolves v4 batch paths", () => {
    expect(marketingMedia("find.mp4")).toMatch(/api\/storage\/public-objects\/marketing\/receebo-real-app\/v4\/eu\/find\.mp4$/);
    expect(marketingMedia("find.mp4", "us")).toContain("/v4/us/find.mp4");
    expect(marketingMedia("find.mp4", "br")).toContain("/v4/br/find.mp4");
  });

  it.each([
    ["eu", "2190"],
    ["us", "1916"],
    ["br", "2010"],
  ] as [MediaMarket, string][])("uses the real %s protection size, contained and never cropped", (m, h) => {
    render(<LandingMediaProvider market={m}><AppCapture file="protection.webp" alt="p" /></LandingMediaProvider>);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", marketingMedia("protection.webp", m));
    expect(img).toHaveAttribute("width", "1070");
    expect(img).toHaveAttribute("height", h);
    expect(img).toHaveClass("object-contain", "md:max-h-[min(72vh,820px)]");
    expect(img).not.toHaveClass("object-cover");
    cleanup();
  });

  it("gives tall Why Receebo screenshots more than the old 420px cell", () => {
    render(<WhyReceeboSection />);
    fireEvent.click(screen.getAllByRole("button", { name: "Prove" })[0]);
    expect(screen.getByTestId("why-media-cell").className).not.toContain("lg:min-h-[420px]");
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("height", "1688");
    expect(img.getAttribute("alt")).toContain("Casa Lumen Eletrónica");
    cleanup();
  });

  it("follows the BR market batch for demo, why and protection copy", () => {
    const ctx = { market: "BR", country: null, source: "visitor", confirmed: true, loading: false, saving: false, error: null, choose: vi.fn(), retry: vi.fn() } as unknown as MarketState;
    render(<MarketContext.Provider value={ctx}><DemoSection /><ConsumerProtectionSection /></MarketContext.Provider>);
    expect(document.body.innerHTML).toContain("/v4/br/capture-poster.webp");
    expect(document.body.textContent).toContain("12 November 2026");
    expect(document.body.textContent).toContain("3 February 2027");
    expect(document.body.textContent).not.toMatch(/inglês|in English/);
    cleanup();
  });

  it("US demo copy searches for display, has no euro and no legal warranty claim", () => {
    render(<LandingMediaProvider market="us"><DemoSection /></LandingMediaProvider>);
    const text = document.body.textContent!;
    expect(text).toContain("“display”");
    expect(text).toContain("Northwind Supply");
    expect(text).toContain("May 2, 2028");
    expect(text).not.toContain("€");
    expect(document.body.innerHTML).toContain("/v4/us/find-poster.webp");
    cleanup();
  });
});
