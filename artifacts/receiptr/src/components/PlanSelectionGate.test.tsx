import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  billing: {} as Record<string, unknown> | undefined,
  isError: false,
  location: "/search",
  startTrial: vi.fn(),
  startTrialError: false,
  checkout: vi.fn(),
  refetch: vi.fn(),
  funnelTrack: vi.fn(),
}));

vi.mock("@/lib/trialFunnel", () => ({ trackTrialInteraction: mocks.funnelTrack }));
vi.mock("@/hooks/useBilling", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useBilling")>("@/hooks/useBilling");
  return {
    ...actual,
    useBillingStatus: () => ({
      data: mocks.billing,
      isLoading: false,
      isError: mocks.isError,
      isFetching: false,
      refetch: mocks.refetch,
    }),
    useStartTrial: () => ({ mutate: mocks.startTrial, isPending: false, isError: mocks.startTrialError }),
    useTrialExpiryTimer: () => undefined,
    useCreateCheckout: () => ({ isPending: false, variables: undefined, mutate: mocks.checkout }),
  };
});
vi.mock("@clerk/react", () => ({ useClerk: () => ({ signOut: vi.fn() }), useAuth: () => ({ isSignedIn: true }) }));
vi.mock("wouter", () => ({
  useLocation: () => [mocks.location, vi.fn()],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { PlanSelectionGate, ACTIVE_REVIEW_KEY } from "./PlanSelectionGate";

const renderGate = () =>
  render(<PlanSelectionGate><div>Protected receipt library</div></PlanSelectionGate>);

beforeEach(() => {
  sessionStorage.clear();
  mocks.billing = { plan: "pro", accessState: "paid", canUseApp: true, canUpload: true };
  mocks.isError = false;
  mocks.location = "/search";
  mocks.startTrial.mockReset();
  mocks.checkout.mockReset();
  mocks.startTrialError = false;
  mocks.funnelTrack.mockReset().mockResolvedValue(true);
});

describe("PlanSelectionGate", () => {
  it("admits owners even when a legacy pending plan exists", () => {
    sessionStorage.setItem("receebo:pendingPlan", "monthly");
    mocks.billing = { plan: "pro", ownerAccess: true, accessState: "owner", canUseApp: true };
    renderGate();
    expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
  });

  it("retains paid-user access", () => {
    renderGate();
    expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
    expect(mocks.funnelTrack).not.toHaveBeenCalled();
  });

  it("admits account-trial users without starting checkout", () => {
    mocks.billing = { plan: "free", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 2 };
    renderGate();
    expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("initializes the trial via POST when not started", () => {
    mocks.billing = { plan: "free", accessState: "not_started", canUseApp: false };
    renderGate();
    expect(mocks.startTrial).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Protected receipt library")).not.toBeInTheDocument();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("shows retry when trial initialization fails", () => {
    mocks.billing = { plan: "free", accessState: "not_started", canUseApp: false };
    mocks.startTrialError = true;
    renderGate();
    fireEvent.click(screen.getByTestId("button-billing-retry"));
    expect(mocks.startTrial).toHaveBeenCalled();
  });

  it("fails closed with retry when billing cannot load", () => {
    mocks.billing = undefined;
    mocks.isError = true;
    renderGate();
    expect(screen.queryByText("Protected receipt library")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-billing-retry"));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("fails closed for unknown access data", () => {
    mocks.billing = { plan: "free" };
    renderGate();
    expect(screen.queryByText("Protected receipt library")).not.toBeInTheDocument();
  });

  it("keeps the app viewable at the 5-receipt cap (no paywall before day 15)", () => {
    mocks.billing = { plan: "free", accessState: "trial_exhausted", canUseApp: true, canUpload: false, trialUploadsUsed: 5,
      trialEndAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), foundingEligible: true };
    for (const path of ["/search", "/receipts/41", "/scan"]) {
      mocks.location = path;
      const { unmount } = renderGate();
      expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
      expect(screen.queryByTestId("text-paywall-title")).toBeNull();
      unmount();
    }
    expect(mocks.funnelTrack).not.toHaveBeenCalled();
  });

  it("paywalls a capped trial from an older server (canUseApp false) with explicit plans and no savings copy", () => {
    mocks.billing = { plan: "free", accessState: "trial_exhausted", canUseApp: false, canUpload: false, reviewReceiptId: 42, foundingEligible: true };
    renderGate();
    expect(screen.getByTestId("text-paywall-title").textContent).toContain("5 free receipts");
    expect(mocks.funnelTrack).toHaveBeenCalledWith({ event: "paywall_viewed", reason: "trial_exhausted" });
    expect(screen.getByTestId("link-review-last-receipt").getAttribute("href")).toBe("/receipts/42");
    expect(document.body.textContent).not.toMatch(/Save \d+%|\/mo billed/);
    fireEvent.click(screen.getByTestId("button-subscribe-yearly"));
    expect(mocks.checkout).toHaveBeenCalledWith("yearly");
  });

  it("allows the review receipt, settings and profile when exhausted", () => {
    mocks.billing = { plan: "free", accessState: "trial_exhausted", canUseApp: false, reviewReceiptId: 42 };
    for (const path of ["/receipts/42", "/settings", "/profile"]) {
      mocks.location = path;
      const { unmount } = renderGate();
      expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
      expect(mocks.funnelTrack).not.toHaveBeenCalled();
      unmount();
    }
    mocks.location = "/receipts/41";
    renderGate();
    expect(screen.queryByText("Protected receipt library")).not.toBeInTheDocument();
  });

  it("keeps an in-progress scan review of the final upload open", () => {
    mocks.billing = { plan: "free", accessState: "trial_exhausted", canUseApp: false, reviewReceiptId: 7 };
    mocks.location = "/scan";
    sessionStorage.setItem(ACTIVE_REVIEW_KEY, "7");
    renderGate();
    expect(screen.getByText("Protected receipt library")).toBeInTheDocument();
  });

  it("paywalls expired trials (day 16)", () => {
    mocks.billing = { plan: "free", accessState: "trial_expired", canUseApp: false, canUpload: false, trialUploadsUsed: 5,
      trialEndAt: new Date(Date.now() - 86_400_000).toISOString() };
    renderGate();
    expect(screen.getByTestId("text-paywall-title").textContent).toContain("15-day free trial has ended");
    expect(screen.queryByText("Protected receipt library")).not.toBeInTheDocument();
    expect(mocks.funnelTrack).toHaveBeenCalledWith({ event: "paywall_viewed", reason: "trial_expired" });
  });
});
