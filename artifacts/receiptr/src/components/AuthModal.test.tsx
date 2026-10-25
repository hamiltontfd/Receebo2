import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/sign-up", navigate] }));
vi.mock("@/pages/landing", () => ({ default: () => <h1>Receebo homepage</h1> }));

import AuthModal from "./AuthModal";

beforeEach(() => {
  navigate.mockClear();
  sessionStorage.clear();
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

  it("allows Escape to dismiss the dialog", () => {
    render(<AuthModal title="Sign in to Receebo">Sign in form</AuthModal>);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
