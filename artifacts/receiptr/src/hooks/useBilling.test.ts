import { describe, expect, it, vi } from "vitest";
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true }) }));
import { ApiError } from "@workspace/api-client-react";
import {
  resolveAccessState,
  hasAppAccess,
  canUploadReceipts,
  uploadBlockedReason,
  quotaErrorMessage,
  isAtTrialCap,
  TRIAL_UPLOAD_LIMIT,
  TRIAL_DAYS,
  type BillingStatus,
} from "./useBilling";
import { TRIAL_CAP_MESSAGE, TRIAL_CAP_BUTTON, TRIAL_AI_READS_MESSAGE, isTrialLimitMessage } from "@/lib/trialCopy";

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
  it("separates viewing from adding: day 1 with 0-4 receipts can add, 5 can view only, day 16 neither", () => {
    for (const used of [0, 1, 2, 3, 4]) {
      const s = b({ plan: "trialing", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsUsed: used, trialUploadsRemaining: 5 - used });
      expect(hasAppAccess(s)).toBe(true);
      expect(canUploadReceipts(s)).toBe(true);
      expect(isAtTrialCap(s)).toBe(false);
    }
    const capped = b({ accessState: "trial_exhausted", canUseApp: true, canUpload: false, trialUploadsUsed: 5 });
    expect(hasAppAccess(capped)).toBe(true);
    expect(canUploadReceipts(capped)).toBe(false);
    expect(isAtTrialCap(capped)).toBe(true);
    // Without explicit flags the capped state still counts as viewable.
    expect(hasAppAccess(b({ accessState: "trial_exhausted" }))).toBe(true);
    const expired = b({ accessState: "trial_expired", canUseApp: false, canUpload: false });
    expect(hasAppAccess(expired)).toBe(false);
    expect(canUploadReceipts(expired)).toBe(false);
  });
  it("uses the 15-day / 5-receipt rule", () => {
    expect(TRIAL_UPLOAD_LIMIT).toBe(5);
    expect(TRIAL_DAYS).toBe(15);
    expect(TRIAL_CAP_MESSAGE).toBe("You've used your 5 free receipts. Subscribe to add more.");
    expect(TRIAL_CAP_BUTTON).toBe("Subscribe");
  });
  it("explains blocked uploads", () => {
    expect(uploadBlockedReason(b({ accessState: "trial_exhausted", canUpload: false }))).toBe(TRIAL_CAP_MESSAGE);
    expect(uploadBlockedReason(b({ accessState: "trial_expired", canUpload: false }))).toContain("15-day free trial has ended");
    expect(uploadBlockedReason(b({ accessState: "paid", canUpload: true }))).toBeNull();
  });
  it("maps quota API errors", () => {
    const err = new ApiError(new Response(null, { status: 402 }), { code: "trial_uploads_exhausted" }, { method: "POST", url: "/x" });
    expect(quotaErrorMessage(err)).toBe(TRIAL_CAP_MESSAGE);
    const server = new ApiError(new Response(null, { status: 403 }), { error: "subscription_required", code: "trial_exhausted" }, { method: "POST", url: "/x" });
    expect(quotaErrorMessage(server)).toBe(TRIAL_CAP_MESSAGE);
    expect(quotaErrorMessage(new Error("x"))).toBeNull();
  });
  it("maps the trial AI read cap to its own copy with a Subscribe action", () => {
    const server = new ApiError(new Response(null, { status: 403 }), { error: "subscription_required", code: "trial_ai_reads_exhausted" }, { method: "POST", url: "/x" });
    expect(quotaErrorMessage(server)).toBe(TRIAL_AI_READS_MESSAGE);
    expect(TRIAL_AI_READS_MESSAGE).toBe("You've used the 10 free receipt reads in your trial. Subscribe to add more.");
    expect(isTrialLimitMessage(TRIAL_AI_READS_MESSAGE)).toBe(true);
    expect(isTrialLimitMessage(TRIAL_CAP_MESSAGE)).toBe(true);
    expect(isTrialLimitMessage("Upload failed")).toBe(false);
  });
});
