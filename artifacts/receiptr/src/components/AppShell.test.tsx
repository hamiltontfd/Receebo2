import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ path: "/search" }));
vi.mock("wouter", () => ({
  useLocation: () => [state.path, vi.fn()],
  Link: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>,
}));
vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("@/components/GuestProvider", () => ({
  useGuestMode: () => ({ isGuest: true, guestUser: { name: "Guest" }, exitGuestMode: vi.fn() }),
}));
vi.mock("@/components/TrialBanner", () => ({ default: () => null }));
vi.mock("@/components/BottomTabBar", () => ({ BottomTabBar: () => null }));
vi.mock("@/components/PendingImports", () => ({ usePendingImportCount: () => 0 }));

import AppShell from "./AppShell";

describe("Desktop active navigation", () => {
  it.each([
    ["/search", "Search"],
    ["/search/results", "Search"],
    ["/scan", "Add"],
    ["/stats", "Stats"],
  ])("highlights only %s with the dark primary style", (path, label) => {
    state.path = path;
    render(<AppShell>Page content</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const button of within(nav).getAllByRole("button")) {
      if (button.textContent === label) {
        expect(button).toHaveClass("bg-primary", "text-primary-foreground");
        expect(button.closest("a")).toHaveAttribute("aria-current", "page");
      } else {
        expect(button).not.toHaveClass("bg-primary");
        expect(button.closest("a")).not.toHaveAttribute("aria-current");
      }
    }
  });
});
