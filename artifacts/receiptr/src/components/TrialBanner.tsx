import { Link } from "wouter";
import { Clock, AlertTriangle } from "lucide-react";
import { useBillingStatus } from "@/hooks/useBilling";

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function TrialBanner() {
  const { data } = useBillingStatus();

  if (!data) return null;

  // Trialing — show days remaining in trial
  if (data.plan === "trialing" && data.trialEndAt) {
    const days = daysUntil(data.trialEndAt);
    const label =
      days === 0
        ? "Your free trial ends today."
        : days === 1
          ? "1 day left in your free trial."
          : `${days} days left in your free trial.`;

    return (
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5 flex items-center justify-center gap-2.5 text-center">
        <Clock className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span>{label}</span>
        <Link href="/settings">
          <span className="underline font-semibold cursor-pointer hover:opacity-75 transition-opacity whitespace-nowrap">
            Upgrade to keep access →
          </span>
        </Link>
      </div>
    );
  }

  // Cancelled — subscription active but will not renew
  if (data.plan === "pro" && data.cancelAtPeriodEnd && data.currentPeriodEnd) {
    const days = daysUntil(data.currentPeriodEnd);
    const label =
      days === 0
        ? "Your subscription ends today. After this, your data will become inaccessible."
        : days === 1
          ? "Your subscription was cancelled. 1 day left to access your data."
          : `Your subscription was cancelled. ${days} days left to access your data.`;

    return (
      <div className="bg-red-50 border-b border-red-200 text-red-900 text-sm px-4 py-2.5 flex items-center justify-center gap-2.5 text-center">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span>{label}</span>
        <Link href="/settings">
          <span className="underline font-semibold cursor-pointer hover:opacity-75 transition-opacity whitespace-nowrap">
            Resubscribe →
          </span>
        </Link>
      </div>
    );
  }

  return null;
}
