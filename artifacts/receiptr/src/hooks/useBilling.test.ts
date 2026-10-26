import { describe, expect, it, vi } from "vitest";
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true }) }));
import { ApiError } from "@workspace/api-client-react";
import {
  resolveAccessState,
  hasAppAccess,
  canUploadReceipts,
  uploadBlockedReason,
  quotaErrorMessage,
  type BillingStatus,
} from "./useBilling";

const b = (x: Partial<BillingStatus>) => ({ plan: "free", trialEndAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, ...x }) as BillingStatus;

describe("billing access helpers", () => {
  it("fails closed without data or unknown states", () => {
    expect(hasAppAccess(undefined)).toBe(false);
    expect(hasAppAccess(b({}))).toBe(false);
    expect(resolveAccessState(b({ accessState: "bogus" as never }))).toBe("subscription_required");
  });
  it("respects explicit server flags", () => {
    expect(hasAppAccess(b({ accessState: "account_trial", canUseApp: true }))).toBe(true);
    expect(hasAppAccess(b({ accessState: "account_trial", canUseApp: false }))).toBe(false);
    expect(hasAppAccess(b({ accessState: "not_started", canUseApp: true }))).toBe(false);
    expect(canUploadReceipts(b({ accessState: "account_trial", canUpload: false }))).toBe(false);
  });
  it("explains blocked uploads", () => {
    expect(uploadBlockedReason(b({ accessState: "trial_exhausted", canUpload: false }))).toContain("3 trial uploads");
    expect(uploadBlockedReason(b({ accessState: "paid", canUpload: true }))).toBeNull();
  });
  it("maps quota API errors", () => {
    const err = new ApiError(new Response(null, { status: 402 }), { code: "trial_uploads_exhausted" }, { method: "POST", url: "/x" });
    expect(quotaErrorMessage(err)).toContain("Nothing was uploaded");
    expect(quotaErrorMessage(new Error("x"))).toBeNull();
  });
});
