import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ billing: {} as Record<string, unknown> }));
vi.mock("@/hooks/useBilling", () => ({
  useBillingStatus: () => ({ data: mocks.billing, isLoading: false }),
  useCreateCheckout: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@clerk/react", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
import { PlanSelectionGate } from "./PlanSelectionGate";

beforeEach(() => {
  sessionStorage.clear();
  mocks.billing = { plan: "pro" };
});

describe("owner plan selection", () => {
  it("admits owners even when a landing-page plan selection was pending", () => {
    sessionStorage.setItem("receebo:pendingPlan", "monthly");
    mocks.billing = { plan: "pro", ownerAccess: true };
    render(<PlanSelectionGate><div>Protected receipt library</div></PlanSelectionGate>);
    expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
  });

  it("retains paid-user access", () => {
    render(<PlanSelectionGate><div>Protected receipt library</div></PlanSelectionGate>);
    expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
  });

  it("does not admit ordinary unpaid users", () => {
    mocks.billing = { plan: "free" };
    render(<PlanSelectionGate><div>Protected receipt library</div></PlanSelectionGate>);
    expect(screen.queryByText("Protected receipt library")).not.toBeInTheDocument();
  });
});
