import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ billing: {} as Record<string, unknown> }));
vi.mock("@/hooks/useBilling", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useBilling")>("@/hooks/useBilling");
  return { ...actual, useBillingStatus: () => ({ data: mocks.billing }) };
});
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import TrialBanner, { formatTimeLeft } from "./TrialBanner";

beforeEach(() => {
  mocks.billing = {};
});

describe("TrialBanner", () => {
  it("shows uploads left, time left and an upgrade-early link", () => {
    mocks.billing = {
      plan: "free",
      accessState: "account_trial",
      trialUploadsRemaining: 2,
      trialUploadsUsed: 1,
      trialEndAt: new Date(Date.now() + 3 * 86_400_000 - 1000).toISOString(),
    };
    render(<TrialBanner />);
    expect(screen.getByTestId("text-trial-status").textContent).toBe("Free trial: 2 of 5 receipts left · 3 days left.");
    expect(screen.getByTestId("link-upgrade-early").getAttribute("href")).toBe("/settings#upgrade-plans");
  });

  it("shows the one-line cap notice with a Subscribe button at 5 receipts", () => {
    mocks.billing = { plan: "free", accessState: "trial_exhausted", canUseApp: true, canUpload: false, trialUploadsUsed: 5 };
    render(<TrialBanner />);
    expect(screen.getByTestId("text-trial-cap").textContent).toBe("You've used your 5 free receipts. Subscribe to add more.");
    const subscribe = screen.getByTestId("link-trial-cap-subscribe");
    expect(subscribe.textContent).toBe("Subscribe");
    expect(subscribe.getAttribute("href")).toBe("/settings#upgrade-plans");
    expect(screen.queryByTestId("banner-trial-ended")).toBeNull();
  });

  it("does not show the cap notice while receipts remain, or after subscribing", () => {
    mocks.billing = { plan: "trialing", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 1, trialUploadsUsed: 4 };
    const first = render(<TrialBanner />);
    expect(screen.queryByTestId("banner-trial-cap")).toBeNull();
    first.unmount();
    mocks.billing = { plan: "pro", accessState: "paid", canUseApp: true, canUpload: true, trialUploadsUsed: 5 };
    render(<TrialBanner />);
    expect(screen.queryByTestId("banner-trial-cap")).toBeNull();
  });

  it("formats sub-day remaining time", () => {
    const now = Date.now();
    expect(formatTimeLeft(new Date(now + 90 * 60_000).toISOString(), now)).toBe("2 hours left");
    expect(formatTimeLeft(new Date(now + 5 * 60_000).toISOString(), now)).toBe("5 minutes left");
    expect(formatTimeLeft(new Date(now - 1).toISOString(), now)).toBe("ending now");
  });
});
