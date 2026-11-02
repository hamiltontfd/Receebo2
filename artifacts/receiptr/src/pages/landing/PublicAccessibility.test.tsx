import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WhyReceeboSection from "./WhyReceeboSection";
import FinalCTASection from "./FinalCTASection";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public landing accessibility", () => {
  it("gives every carousel control a focus outline independent of selection", () => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    render(<WhyReceeboSection />);
    const controls = screen.getAllByRole("button");
    expect(controls).toHaveLength(8);
    for (const control of controls) {
      expect(control).toHaveClass(
        "focus-visible:outline-2",
        "focus-visible:outline-foreground",
      );
      expect(control).not.toHaveClass("focus-visible:outline-none");
      // Keep tab outlines inside the overflow-hidden card; dot outlines outside.
      expect(control).toHaveClass(
        control.hasAttribute("aria-pressed")
          ? "focus-visible:-outline-offset-4"
          : "focus-visible:outline-offset-4",
      );
    }
  });

  it("uses higher-contrast trial fine print", () => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    const { container } = render(<FinalCTASection />);
    const finePrint = container.querySelector("p.text-sm");
    expect(finePrint).toHaveClass("text-background/70");
    expect(finePrint).not.toHaveClass("text-background/40");
  });
});
