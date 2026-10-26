import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as R from "react";

vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, {
    get: (_t, tag: string) => ({ children, variants: _v, initial: _i, animate: _a, transition: _tr, whileHover: _h, whileTap: _w, ...props }: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      R.createElement(tag, props, children as any),
  }),
}));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: false }) }));
vi.mock("@/hooks/useBilling", () => ({ useCreateCheckout: () => ({ mutate: vi.fn(), isPending: false }) }));

import HeroSection from "./HeroSection";

describe("HeroSection", () => {
  it("shows the hero subtitle and trial line", () => {
    render(<HeroSection />);
    expect(screen.getByText("Scan or import from Outlook. Find any purchase in seconds. Never miss a return or warranty date.")).toBeTruthy();
    expect(screen.getByText("15 days free, up to 5 receipts.")).toBeTruthy();
  });

  it("shows real phone captures in frames with sample-data disclosure", () => {
    render(<HeroSection />);
    expect(screen.getByTestId("img-hero-library-phone").getAttribute("src")).toContain("library-phone.webp");
    expect(screen.getByTestId("img-hero-receipt-phone").getAttribute("src")).toContain("receipt-phone.webp");
    expect(document.body.innerHTML).not.toContain("hero-1200");
    const caption = screen.getByText("Real Receebo screens. Fictional sample purchases and simulated extraction.");
    expect(caption.tagName).toBe("FIGCAPTION");
    for (const id of ["img-hero-library-phone", "img-hero-receipt-phone"]) {
      const image = screen.getByTestId(id);
      expect(image.style.marginTop).toBe(`${-(32 / 390) * 100}%`);
      expect(image.parentElement?.className).toContain("overflow-hidden");
      expect(image.parentElement?.parentElement?.className).toContain("pt-5");
      expect(image.contains(caption)).toBe(false);
    }
  });
});
