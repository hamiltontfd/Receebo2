import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, clerk } = vi.hoisted(() => ({ navigate: vi.fn(), clerk: { loaded: true } }));
vi.mock("wouter", () => ({ useLocation: () => ["/sign-up", navigate] }));
vi.mock("@/pages/landing", () => ({ default: () => <h1>Receebo homepage</h1> }));
vi.mock("@clerk/react", () => ({
  ClerkLoading: ({ children }: { children?: unknown }) => clerk.loaded ? null : children,
  ClerkLoaded: ({ children }: { children?: unknown }) => clerk.loaded ? children : null,
}));

import AuthModal from "./AuthModal";

beforeEach(() => {
  navigate.mockClear();
  sessionStorage.clear();
  clerk.loaded = true;
});

describe("AuthModal", () => {
  it("keeps the homepage behind an accessible auth dialog without clearing trial intent", () => {
    sessionStorage.setItem("receebo:pendingPlan", "monthly");
    render(<AuthModal title="Sign in to Receebo"><input aria-label="Email" /></AuthModal>);
    expect(screen.getByText("Receebo homepage")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Sign in to Receebo" })).toBeInTheDocument();
    expect(sessionStorage.getItem("receebo:pendingPlan")).toBe("monthly");
  });

  it.each(["Back to homepage", "Close"])("returns home and cancels pending checkout using %s", (name) => {
    sessionStorage.setItem("receebo:pendingPlan", "yearly");
    render(<AuthModal title="Create your Receebo account">Sign up form</AuthModal>);
    fireEvent.click(screen.getByRole("button", { name }));
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
    expect(sessionStorage.getItem("receebo:pendingPlan")).toBeNull();
  });

  it("shows a spinner instead of an empty dialog while Clerk is loading", () => {
    clerk.loaded = false;
    render(<AuthModal title="Sign in to Receebo"><input aria-label="Email" /></AuthModal>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("allows Escape to dismiss the dialog", () => {
    render(<AuthModal title="Sign in to Receebo">Sign in form</AuthModal>);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
