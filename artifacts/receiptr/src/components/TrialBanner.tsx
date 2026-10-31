import { useEffect, useState } from "react";
import { appText } from "@/lib/appCopy";
import { useAppLocale } from "@/lib/locale";
import { Link } from "wouter";
import { Clock, AlertTriangle } from "lucide-react";
import { useBillingStatus, resolveAccessState, TRIAL_UPLOAD_LIMIT } from "@/hooks/useBilling";
import { TRIAL_CAP_MESSAGE, TRIAL_CAP_BUTTON, SUBSCRIBE_HREF } from "@/lib/trialCopy";

export function formatTimeLeft(isoDate: string, now: number): string {
  const ms = new Date(isoDate).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return appText("ending now");
  const hours = ms / 3_600_000;
  if (hours < 1) {
    const mins = Math.max(1, Math.ceil(ms / 60_000));
    return appText("{0} minute(s) left", [mins]);
  }
  if (hours < 24) {
    const h = Math.ceil(hours);
    return appText("{0} hour(s) left", [h]);
  }
  const d = Math.ceil(hours / 24);
  return appText("{0} day(s) left", [d]);
}

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function TrialBanner() {
  useAppLocale();
  const { data } = useBillingStatus();
  const now = useNow(30_000);

  if (!data) return null;
  const state = resolveAccessState(data);

  if (state === "account_trial") {
    const remaining = data.trialUploadsRemaining ?? Math.max(0, TRIAL_UPLOAD_LIMIT - (data.trialUploadsUsed ?? 0));
    const time = data.trialEndAt ? formatTimeLeft(data.trialEndAt, now) : null;
    return (
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center" data-testid="banner-trial">
        <Clock className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span data-testid="text-trial-status">
          {appText("Free trial: {0} of {1} receipts left", [remaining, TRIAL_UPLOAD_LIMIT])}{time ? ` · ${time}` : ""}.
        </span>
        <Link href="/settings#upgrade-plans" className="underline font-semibold hover:opacity-75 transition-opacity whitespace-nowrap" data-testid="link-upgrade-early">
          {appText("Upgrade now")}
        </Link>
      </div>
    );
  }

  if (state === "trial_exhausted") {
    // One-line notice on every app page until they subscribe or day 15 (then the paywall).
    return (
      <div className="bg-amber-50 border-b border-amber-200 text-amber-950 text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center" role="status" data-testid="banner-trial-cap">
        <span data-testid="text-trial-cap">{appText(TRIAL_CAP_MESSAGE)}</span>
        <Link href={SUBSCRIBE_HREF} className="inline-flex h-7 items-center rounded-full bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90 whitespace-nowrap" data-testid="link-trial-cap-subscribe">
          {appText(TRIAL_CAP_BUTTON)}
        </Link>
      </div>
    );
  }

  if (state === "trial_expired" || state === "subscription_required") {
    const label =
      state === "trial_expired"
          ? "Your free trial has ended."
          : "Your subscription is inactive.";
    return (
      <div className="bg-red-50 border-b border-red-200 text-red-900 text-sm px-4 py-2.5 flex flex-wrap items-center justify-center gap-2.5 text-center" data-testid="banner-trial-ended">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span>{appText(label)}</span>
        <Link href="/settings#upgrade-plans" className="underline font-semibold hover:opacity-75 transition-opacity whitespace-nowrap">
          {appText("Subscribe")}
        </Link>
      </div>
    );
  }

  if (state === "legacy_stripe_trial" && data.trialEndAt) {
    const days = daysUntil(data.trialEndAt);
    const label = days === 0 ? appText("Your trial ends today.") : appText("{0} day(s) left in your trial.", [days]);
    return (
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5 flex items-center justify-center gap-2.5 text-center">
        <Clock className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span>{label}</span>
        <Link href="/settings" className="underline font-semibold hover:opacity-75 transition-opacity whitespace-nowrap">
          {appText("Manage plan")}
        </Link>
      </div>
    );
  }

  if (state === "paid" && data.cancelAtPeriodEnd && data.currentPeriodEnd) {
    const days = daysUntil(data.currentPeriodEnd);
    const label =
      days === 0
        ? "Your subscription ends today. After this, your data will become inaccessible."
        : days === 1
          ? appText("Your subscription was cancelled. {0} day(s) left to access your data.", [1])
          : appText("Your subscription was cancelled. {0} day(s) left to access your data.", [days]);
    return (
      <div className="bg-red-50 border-b border-red-200 text-red-900 text-sm px-4 py-2.5 flex items-center justify-center gap-2.5 text-center">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span>{appText(label)}</span>
        <Link href="/settings" className="underline font-semibold hover:opacity-75 transition-opacity whitespace-nowrap">
          {appText("Resubscribe")}
        </Link>
      </div>
    );
  }

  return null;
}
