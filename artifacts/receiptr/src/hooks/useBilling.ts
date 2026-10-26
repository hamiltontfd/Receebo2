import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  getSubscriptionStatus,
  createCheckoutSession,
  createPortalSession,
  customFetch,
  ApiError,
  type SubscriptionStatus,
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { recordCheckoutCancellation } from "@/lib/trialFunnel";
import {
  TRIAL_RECEIPT_LIMIT, TRIAL_LENGTH_DAYS, TRIAL_CAP_MESSAGE, TRIAL_EXPIRED_MESSAGE,
} from "@/lib/trialCopy";

const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

export const BILLING_QUERY_KEY = ["billing", "subscription"] as const;
export const BILLING_POLL_MS = 10_000;
export const TRIAL_UPLOAD_LIMIT = TRIAL_RECEIPT_LIMIT;
export const TRIAL_DAYS = TRIAL_LENGTH_DAYS;
export const MONTHLY_PRICE = "€2.99";
export const YEARLY_PRICE = "€24.99";

export type AccessState =
  | "not_started"
  | "account_trial"
  | "trial_exhausted"
  | "trial_expired"
  | "legacy_stripe_trial"
  | "paid"
  | "owner"
  | "subscription_required";

/**
 * Server billing payload, extended with the no-card account trial fields.
 * Every consumer must treat a missing entitlement as "no access".
 */
export type BillingStatus = SubscriptionStatus & {
  accessState?: AccessState;
  trialUploadsRemaining?: number | null;
  trialUploadsUsed?: number;
  foundingEligible?: boolean;
  canUpload?: boolean;
  canUseApp?: boolean;
  reviewReceiptId?: number | null;
};

const ACCESS_STATES: AccessState[] = [
  "not_started",
  "account_trial",
  "trial_exhausted",
  "trial_expired",
  "legacy_stripe_trial",
  "paid",
  "owner",
  "subscription_required",
];

/** Resolve the access state. Unknown or missing values fail closed. */
export function resolveAccessState(b: BillingStatus | undefined | null): AccessState {
  if (!b) return "subscription_required";
  if (b.accessState && ACCESS_STATES.includes(b.accessState)) return b.accessState;
  if (b.ownerAccess) return "owner";
  if (b.plan === "pro") return "paid";
  if (b.plan === "trialing") return "legacy_stripe_trial";
  return "subscription_required";
}

// trial_exhausted can still view everything (it just cannot add receipts).
const FULL_ACCESS: AccessState[] = ["account_trial", "trial_exhausted", "legacy_stripe_trial", "paid", "owner"];

/** True only when the server explicitly allows app use (or a known full-access state without the flag). */
export function hasAppAccess(b: BillingStatus | undefined | null): boolean {
  if (!b) return false;
  const state = resolveAccessState(b);
  if (typeof b.canUseApp === "boolean") return b.canUseApp && state !== "not_started";
  return FULL_ACCESS.includes(state);
}

export function canUploadReceipts(b: BillingStatus | undefined | null): boolean {
  if (!b) return false;
  if (typeof b.canUpload === "boolean") return b.canUpload;
  const state = resolveAccessState(b);
  return state === "paid" || state === "owner" || state === "legacy_stripe_trial";
}

/** True when a trial user has used every free receipt (can view, cannot add). */
export function isAtTrialCap(b: BillingStatus | undefined | null): boolean {
  return !!b && resolveAccessState(b) === "trial_exhausted";
}

export function isPaidLike(b: BillingStatus | undefined | null): boolean {
  const s = resolveAccessState(b);
  return s === "paid" || s === "legacy_stripe_trial";
}

/** Human-readable reason uploads are blocked, or null when allowed. */
export function uploadBlockedReason(b: BillingStatus | undefined | null): string | null {
  if (canUploadReceipts(b)) return null;
  const state = resolveAccessState(b);
  if (state === "trial_exhausted") return TRIAL_CAP_MESSAGE;
  if (state === "trial_expired") return TRIAL_EXPIRED_MESSAGE;
  if (state === "account_trial")
    return "Your remaining free receipts are still processing. Try again in a moment, or subscribe to add more.";
  if (state === "not_started") return "Your trial is still being set up. Try again in a moment.";
  return "An active subscription is needed to add receipts.";
}

/** Map an upload/create failure to a clear quota message when applicable. */
export function quotaErrorMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 402 && err.status !== 403 && err.status !== 429) return null;
  const data = err.data as { error?: string; code?: string; message?: string } | null;
  const code = `${data?.code ?? ""} ${data?.error ?? ""}`.toLowerCase();
  if (code.includes("exhaust") || code.includes("quota") || code.includes("upload"))
    return TRIAL_CAP_MESSAGE;
  if (code.includes("expire")) return TRIAL_EXPIRED_MESSAGE;
  if (err.status === 429) return null;
  return "Your plan doesn't allow more uploads right now. Check your plan in Settings. Nothing was uploaded.";
}

function isCheckoutSuccess() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("checkout") === "success";
}

export function useBillingStatus() {
  const { isSignedIn } = useAuth();
  const afterCheckout = isCheckoutSuccess();
  useEffect(() => {
    if (isSignedIn) void recordCheckoutCancellation();
  }, [isSignedIn]);

  return useQuery<BillingStatus>({
    queryKey: BILLING_QUERY_KEY,
    queryFn: () => getSubscriptionStatus(base) as Promise<BillingStatus>,
    enabled: !!isSignedIn,
    staleTime: 0,
    // Poll so uploads/payments made on another device show up here. After
    // checkout, poll faster until the paid state arrives.
    refetchInterval: (query) => {
      const data = query.state.data as BillingStatus | undefined;
      if (afterCheckout && !isPaidLike(data) && resolveAccessState(data) !== "owner") return 2000;
      return BILLING_POLL_MS;
    },
    refetchIntervalInBackground: false,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}

/** Refetch billing exactly when the account trial ends. */
export function useTrialExpiryTimer(billing: BillingStatus | undefined) {
  const queryClient = useQueryClient();
  const state = resolveAccessState(billing);
  const endAt = state === "account_trial" || state === "trial_exhausted" ? billing?.trialEndAt ?? null : null;
  useEffect(() => {
    if (!endAt) return;
    const ms = new Date(endAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return;
    // setTimeout caps at ~24.8 days; trials are 15 days.
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY }),
      Math.max(0, ms) + 250,
    );
    return () => clearTimeout(timer);
  }, [endAt, queryClient]);
}

export function startAccountTrial(): Promise<BillingStatus | unknown> {
  return customFetch(`${base}api/billing/start-trial`, { method: "POST" });
}

/** Idempotent server initialization of the no-card trial entitlement. */
export function useStartTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startAccountTrial,
    retry: 1,
    onSettled: () => queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY }),
  });
}

/** Refresh billing (e.g. after an upload changes the trial counter). */
export function useRefreshBilling() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
}

/** Explicit, user-initiated paid checkout. Charged immediately (no Stripe trial). */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: (planType: "monthly" | "yearly") => createCheckoutSession(base, planType),
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Couldn't start checkout",
        description: "Something went wrong on our side. Nothing was charged. Please try again.",
      });
    },
  });
}

export function useCreatePortal() {
  return useMutation({
    mutationFn: () => createPortalSession(base),
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
  });
}
