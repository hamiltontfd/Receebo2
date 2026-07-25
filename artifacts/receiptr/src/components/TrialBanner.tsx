import { useState } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { useBillingStatus } from "@/hooks/useBilling";

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function TrialBanner() {
  const { data } = useBillingStatus();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!data || data.plan !== "trialing" || !data.trialEndAt) return null;

  const days = daysUntil(data.trialEndAt);
  if (days > 7) return null;

  const label =
    days === 0
      ? "Your Pro trial ends today — don't lose unlimited uploads."
      : days === 1
        ? "Your Pro trial ends tomorrow — keep unlimited uploads by upgrading."
        : days <= 3
          ? `Your Pro trial ends in ${days} days — upgrade to keep unlimited uploads.`
          : `Your Pro trial ends in ${days} days.`;

  const cta = days <= 3 ? "Upgrade now" : "Manage subscription";

  return (
    <div className="bg-foreground text-background text-sm px-4 py-2 flex items-center justify-center gap-3 text-center relative">
      <span>{label}</span>
      <Link href="/settings">
        <span className="underline font-semibold cursor-pointer hover:opacity-80 transition-opacity">
          {cta}
        </span>
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
