import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as R from "react";
import HowItWorksSection from "./HowItWorksSection";
import SecuritySection from "./SecuritySection";
import { LandingContent } from "../landing";

vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  MotionConfig: ({ children }: { children: R.ReactNode }) => R.createElement(R.Fragment, null, children),
  motion: new Proxy({}, {
    get: (_t, tag: string) => ({ children, variants: _v, initial: _i, animate: _a, whileInView: _wv, viewport: _vp, transition: _tr, whileHover: _h, whileTap: _w, ...props }: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      R.createElement(tag, props, children as any),
  }),
}));

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("How it works + security (landing)", () => {
  it("renders three steps with step 3 highlighted and the Best Buy notification in English", () => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    render(<HowItWorksSection />);
    expect(screen.getByRole("heading", { name: "How it works" })).toBeTruthy();
    expect(screen.getByText("Snap or forward your receipt")).toBeTruthy();
    expect(screen.getByText(/manufacturer's warranty/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/legal warranty/i);
    expect(screen.getByTestId("how-it-works-notification").textContent).toContain(
      "Best Buy · Return window closes in 3 days",
    );
    const icon = screen.getByTestId("how-it-works-push-icon") as HTMLImageElement;
    expect(icon.getAttribute("src")).toMatch(/icons\/receebo-outline-192\.png$/);
    expect(screen.getByText("Free for 15 days. No credit card.")).toBeTruthy();
    expect(screen.getByText("Free for 15 days. No credit card.")).toHaveClass("text-foreground/80");
  });

  it("/us keeps manufacturer-only wording and Best Buy even in pt-BR", () => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    const langs = vi.spyOn(navigator, "languages", "get");
    langs.mockReturnValue(["pt-BR"]);
    render(<HowItWorksSection variant="us" />);
    expect(screen.getByText("Como funciona")).toBeTruthy();
    expect(screen.getByText(/garantia do fabricante/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("garantia legal");
    expect(screen.getByTestId("how-it-works-notification").textContent).toContain("Best Buy");
    expect(screen.getByTestId("how-it-works-notification").textContent).not.toContain("Magalu");
    langs.mockRestore();
  });

  it("pt-BR default landing uses Magalu and legal + manufacturer side by side", () => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    const langs = vi.spyOn(navigator, "languages", "get");
    langs.mockReturnValue(["pt-BR"]);
    render(<HowItWorksSection />);
    expect(screen.getByText(/garantia legal e do fabricante/)).toBeTruthy();
    expect(screen.getByTestId("how-it-works-notification").textContent).toContain(
      "Magalu · Prazo de troca acaba em 3 dias",
    );
    langs.mockRestore();
  });

  it("security section has the four approved claims and no certification seals", () => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    render(<SecuritySection />);
    expect(document.getElementById("security")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your receipts, protected" })).toBeTruthy();
    expect(screen.getByText("Receipt details encrypted at rest")).toBeTruthy();
    expect(screen.getByText(/AES-256-GCM/)).toBeTruthy();
    expect(screen.getByText("Traffic encrypted with HTTPS")).toBeTruthy();
    expect(screen.getByText("We never sell your data")).toBeTruthy();
    expect(screen.getByText("Delete your account anytime")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/ISO|SOC 2|GDPR-certified|everything encrypted|Gmail/i);
  });

  it("LandingContent places security immediately after how-it-works, with no hero badge", () => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const { container } = render(<LandingContent variant="us" />);
    const how = container.querySelector("#how-it-works");
    const security = container.querySelector("#security");
    expect(how).toBeTruthy();
    expect(security).toBeTruthy();
    expect(how!.compareDocumentPosition(security!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No intervening section between them.
    let n = how!.nextElementSibling;
    while (n && n !== security && n.tagName !== "SECTION") n = n.nextElementSibling;
    expect(n).toBe(security);
    expect(container.textContent).not.toMatch(/Your receipts, encrypted|Seus recibos, criptografados|Os seus recibos, encriptados/);
    expect(container.querySelector("[data-testid='hero-trust-badge']")).toBeNull();
  });
});
