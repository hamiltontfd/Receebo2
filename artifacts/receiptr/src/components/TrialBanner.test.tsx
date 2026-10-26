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
    expect(screen.getByTestId("text-trial-status").textContent).toBe("Free trial: 2 of 3 uploads left · 3 days left.");
    expect(screen.getByTestId("link-upgrade-early").getAttribute("href")).toBe("/settings#upgrade-plans");
  });

  it("shows an exhausted notice", () => {
    mocks.billing = { plan: "free", accessState: "trial_exhausted" };
    render(<TrialBanner />);
    expect(screen.getByTestId("banner-trial-ended").textContent).toContain("all 3 trial uploads");
  });

  it("formats sub-day remaining time", () => {
    const now = Date.now();
    expect(formatTimeLeft(new Date(now + 90 * 60_000).toISOString(), now)).toBe("2 hours left");
    expect(formatTimeLeft(new Date(now + 5 * 60_000).toISOString(), now)).toBe("5 minutes left");
    expect(formatTimeLeft(new Date(now - 1).toISOString(), now)).toBe("ending now");
  });
});
