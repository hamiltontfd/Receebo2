import { describe, expect, it } from "vitest";
import { frozenRetentionNotice, isFrozenAccount, FROZEN_EXPORT_NOTE } from "./accountLifecycle";
import type { BillingStatus } from "@/hooks/useBilling";

const b = (x: Partial<BillingStatus>) =>
  ({ plan: "free", trialEndAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, ...x }) as BillingStatus;

describe("frozen account notices", () => {
  it("treats only lost access as frozen", () => {
    expect(isFrozenAccount(b({ accessState: "trial_expired", canUseApp: false }))).toBe(true);
    expect(isFrozenAccount(b({ accessState: "subscription_required", canUseApp: false }))).toBe(true);
    expect(isFrozenAccount(b({ accessState: "account_trial", canUseApp: true }))).toBe(false);
    expect(isFrozenAccount(b({ accessState: "trial_exhausted", canUseApp: true }))).toBe(false);
    expect(isFrozenAccount(b({ accessState: "paid", canUseApp: true }))).toBe(false);
    expect(isFrozenAccount(undefined)).toBe(false);
  });

  it("shows the exact deletion date and points copies to email, not a download", () => {
    const notice = frozenRetentionNotice(b({ accessState: "trial_expired", canUseApp: false, dataDeletionAt: "2026-12-26T09:00:00.000Z" }));
    expect(notice).toBe("Your receipts are kept until 26 Dec 2026, then permanently deleted. Subscribe before then to keep them.");
    expect(frozenRetentionNotice(b({ accessState: "paid", canUseApp: true }))).toBeNull();
    expect(FROZEN_EXPORT_NOTE).toContain("contact@receebo.net");
  });
});
