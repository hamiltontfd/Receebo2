import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, clerk, route } = vi.hoisted(() => ({ navigate: vi.fn(), clerk: { loaded: true }, route: { path: "/sign-up", search: "" } }));
vi.mock("wouter", () => ({ useLocation: () => [route.path, navigate], useSearch: () => route.search }));
vi.mock("@/pages/landing", () => ({ default: ({ variant }: { variant?: string }) => <h1 data-variant={variant ?? "default"}>Receebo homepage</h1> }));
vi.mock("@clerk/react", () => ({
  ClerkLoading: ({ children }: { children?: unknown }) => clerk.loaded ? null : children,
  ClerkLoaded: ({ children }: { children?: unknown }) => clerk.loaded ? children : null,
}));

import AuthModal from "./AuthModal";

beforeEach(() => {
  navigate.mockClear();
  sessionStorage.clear();
  clerk.loaded = true;
  route.path = "/sign-up"; route.search = "";
});

describe("AuthModal", () => {
  it("keeps the homepage behind an accessible auth dialog without clearing trial intent", () => {
    sessionStorage.setItem("receebo:pendingPlan", "monthly");
    render(<AuthModal title="Sign in to Receebo"><input aria-label="Email" /></AuthModal>);
    expect(screen.getByText("Receebo homepage")).toBeInTheDocument();
    expect(screen.getByText("Receebo homepage")).toHaveAttribute("data-variant", "default");
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

  it.each(["/sign-up", "/sign-in", "/sign-up/verify-email-address"])("keeps the US background and returns to /us for %s", path => {
    route.path = path; route.search = "landing=us&utm_source=meta&fbclid=synthetic";
    render(<AuthModal title="Authentication">Form</AuthModal>);
    expect(screen.getByText("Receebo homepage")).toHaveAttribute("data-variant", "us");
    fireEvent.click(screen.getByRole("button", { name: "Back to homepage" }));
    expect(navigate).toHaveBeenCalledWith("/us", { replace: true });
  });
  it.each(["landing=US", "landing=br", "landing="])("ignores non-US display context %s", search => {
    route.search = search;
    render(<AuthModal title="Authentication">Form</AuthModal>);
    expect(screen.getByText("Receebo homepage")).toHaveAttribute("data-variant", "default");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
