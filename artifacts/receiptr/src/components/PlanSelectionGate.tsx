import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useClerk } from "@clerk/react";
import {
  useBillingStatus,
  useStartTrial,
  useTrialExpiryTimer,
  resolveAccessState,
  hasAppAccess,
  isPaidLike,
  TRIAL_UPLOAD_LIMIT,
  TRIAL_DAYS,
  type AccessState,
  type BillingStatus,
} from "@/hooks/useBilling";
import { PlanChoice, FoundingNote } from "@/components/PlanChoice";
import { trackTrialInteraction } from "@/lib/trialFunnel";
import { frozenRetentionNotice, FROZEN_COPY_NOTE } from "@/lib/accountLifecycle";

const ACTIVATING_TIMEOUT_MS = 10_000;
export const ACTIVE_REVIEW_KEY = "receebo:activeReviewReceiptId";

function isCheckoutSuccess() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("checkout") === "success";
}

function clearCheckoutParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  window.history.replaceState({}, "", url.toString());
}

function activeScanReviewId(): number | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_REVIEW_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Routes reachable without app access: account settings/profile (billing,
 * deletion, sign-out), and review of the receipt from the final trial upload.
 * Legal pages live outside the protected shell.
 */
export function isRouteAllowedWithoutAccess(path: string, billing: BillingStatus | undefined): boolean {
  if (path === "/settings" || path.startsWith("/settings/")) return true;
  if (path === "/profile" || path.startsWith("/profile/")) return true;
  const reviewId = billing?.reviewReceiptId ?? null;
  if (reviewId != null) {
    if (path === `/receipts/${reviewId}`) return true;
    if (path === "/scan" && activeScanReviewId() === reviewId) return true;
  }
  return false;
}

function FullScreenSkeleton({ label }: { label?: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-background text-foreground" data-testid="status-billing-loading">
      <div className="w-full max-w-md px-6 space-y-3" aria-hidden>
        <div className="h-6 w-2/3 mx-auto rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-1/2 mx-auto rounded-lg bg-muted animate-pulse" />
      </div>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

function GateHeader() {
  const { signOut } = useClerk();
  return (
    <header className="flex h-14 px-5 items-center justify-between border-b">
      <button
        onClick={() => signOut({ redirectUrl: "/" })}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-gate-signout"
      >
        Sign out
      </button>
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Receebo" className="h-7 w-auto" />
      <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors w-16 text-right" data-testid="link-gate-settings">
        Settings
      </Link>
    </header>
  );
}

function ErrorScreen({ title, body, onRetry, retrying }: { title: string; body: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <GateHeader />
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-5 text-center" data-testid="status-billing-error">
        <span className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-muted-foreground" />
        </span>
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-sm">{body}</p>
        <Button className="rounded-full gap-2" onClick={onRetry} disabled={retrying} data-testid="button-billing-retry">
          {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
          Try again
        </Button>
      </main>
    </div>
  );
}

const PAYWALL_COPY: Partial<Record<AccessState, { eyebrow: string; title: string; body: string }>> = {
  trial_exhausted: {
    // Not normally shown: at the cap the app stays viewable until day 15.
    eyebrow: "Trial complete",
    title: `You've used your ${TRIAL_UPLOAD_LIMIT} free receipts.`,
    body: "Your receipts are kept safe. Subscribe to keep scanning and searching them.",
  },
  trial_expired: {
    eyebrow: "Trial ended",
    title: `Your ${TRIAL_DAYS}-day free trial has ended.`,
    body: "Your receipts are kept safe. Subscribe to keep scanning and searching them.",
  },
  subscription_required: {
    eyebrow: "Subscription needed",
    title: "Subscribe to use Receebo.",
    body: "Choose a plan to scan, store and search your receipts.",
  },
};

/**
 * Wraps protected routes. Initializes the no-card account trial after legal
 * consent (rendered inside LegalConsentGate), admits users with access and
 * shows an explicit paid plan choice otherwise. Fails closed on errors.
 */
export function PlanSelectionGate({ children }: { children: React.ReactNode }) {
  const billingQuery = useBillingStatus();
  const { data: billing, isLoading, isError, refetch, isFetching } = billingQuery;
  const startTrial = useStartTrial();
  const [location] = useLocation();
  const startFiredRef = useRef(false);
  const [activatingTimedOut, setActivatingTimedOut] = useState(false);

  useTrialExpiryTimer(billing);

  const state = resolveAccessState(billing);

  // Initialize the trial entitlement once when the server says not_started.
  const startMutate = startTrial.mutate;
  useEffect(() => {
    if (billing && state === "not_started" && !startFiredRef.current) {
      startFiredRef.current = true;
      startMutate();
    }
  }, [billing, state, startMutate]);

  const inActivatingState =
    !!billing && isCheckoutSuccess() && !isPaidLike(billing) && state !== "owner" && !activatingTimedOut;

  const visiblePaywall = !!billing && !isLoading && !inActivatingState &&
    !hasAppAccess(billing) && !isRouteAllowedWithoutAccess(location, billing) &&
    (state === "trial_expired" || state === "trial_exhausted");
  useEffect(() => {
    if (visiblePaywall && (state === "trial_expired" || state === "trial_exhausted")) {
      void trackTrialInteraction({ event: "paywall_viewed", reason: state });
    }
  }, [visiblePaywall, state]);

  useEffect(() => {
    if (!inActivatingState) return;
    const timer = setTimeout(() => {
      clearCheckoutParam();
      setActivatingTimedOut(true);
    }, ACTIVATING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [inActivatingState]);

  if (isLoading) return <FullScreenSkeleton />;

  if (!billing) {
    // Fail closed: no billing data means no app access.
    return (
      <ErrorScreen
        title="We couldn't check your plan."
        body={isError ? "Your receipts are safe. Check your connection and try again." : "Loading your plan."}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  if (state === "not_started") {
    if (startTrial.isError) {
      return (
        <ErrorScreen
          title="We couldn't start your trial."
          body="Nothing was charged. Check your connection and try again."
          onRetry={() => startTrial.mutate()}
          retrying={startTrial.isPending}
        />
      );
    }
    return <FullScreenSkeleton label={`Setting up your ${TRIAL_DAYS}-day free trial`} />;
  }

  if (hasAppAccess(billing)) return <>{children}</>;

  if (inActivatingState) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-background text-foreground" data-testid="status-activating">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Activating your subscription</p>
      </div>
    );
  }

  if (isRouteAllowedWithoutAccess(location, billing)) return <>{children}</>;

  const copy = PAYWALL_COPY[state] ?? PAYWALL_COPY.subscription_required!;
  const founding = billing.foundingEligible === true;
  const reviewId = billing.reviewReceiptId ?? null;

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <GateHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-5 py-12" data-testid="screen-paywall">
        {activatingTimedOut && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mb-6 max-w-md w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground text-center"
          >
            Your payment is taking longer than expected to confirm. Try refreshing in a moment before paying again.
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10 max-w-md"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{copy.eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight" data-testid="text-paywall-title">
            {copy.title}
          </h1>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{copy.body}</p>
          {frozenRetentionNotice(billing) && (
            <p className="mt-3 text-muted-foreground text-xs leading-relaxed" data-testid="text-paywall-retention">
              {frozenRetentionNotice(billing)} {FROZEN_COPY_NOTE}
            </p>
          )}
          {reviewId != null && (
            <Link
              href={`/receipts/${reviewId}`}
              className="inline-block mt-4 text-sm font-semibold underline underline-offset-4"
              data-testid="link-review-last-receipt"
            >
              Review your last uploaded receipt
            </Link>
          )}
        </motion.div>

        <PlanChoice founding={founding} />
        <FoundingNote founding={founding} className="mt-6 max-w-md" />
      </main>
    </div>
  );
}
