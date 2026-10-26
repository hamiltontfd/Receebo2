import { OwnerAccessNotice } from "@/components/OwnerAccessNotice";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  useBillingStatus,
  useCreatePortal,
  resolveAccessState,
  isPaidLike,
  TRIAL_UPLOAD_LIMIT,
  type AccessState,
  type BillingStatus,
} from "@/hooks/useBilling";
import { PlanChoice, FoundingNote } from "@/components/PlanChoice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Check, Minus } from "lucide-react";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";
import { PrivacyAndDataSettings } from "@/components/PrivacyAndDataSettings";
import { MailConnections } from "@/components/MailConnections";
import { MAIL_PROVIDER_LABELS, readMailOAuthResult } from "@/lib/mailConnection";

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

// ─── Notification preferences ────────────────────────────────────────────────

async function fetchNotificationPrefs(base: string): Promise<{ optOut: boolean }> {
  const res = await fetch(`${base}api/notifications/preferences`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load preferences");
  return res.json() as Promise<{ optOut: boolean }>;
}

async function patchNotificationPrefs(base: string, optOut: boolean): Promise<{ optOut: boolean }> {
  const res = await fetch(`${base}api/notifications/preferences`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optOut }),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  return res.json() as Promise<{ optOut: boolean }>;
}

function useNotificationPreferences() {
  const query = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: () => fetchNotificationPrefs(BASE),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (optOut: boolean) => patchNotificationPrefs(BASE, optOut),
  });

  return { query, mutation };
}

// ─── Plan badge ───────────────────────────────────────────────────────────────

export function AccessBadge({ billing }: { billing: BillingStatus | undefined }) {
  const state = resolveAccessState(billing);
  const labels: Record<AccessState, string> = {
    paid: "Pro",
    owner: "Owner access",
    legacy_stripe_trial: "Pro Trial",
    account_trial: "Free trial",
    not_started: "Setting up",
    trial_exhausted: "Trial used",
    trial_expired: "Trial ended",
    subscription_required: "Inactive",
  };
  const strong = state === "paid" || state === "owner";
  const outline = state === "legacy_stripe_trial" || state === "account_trial";
  return (
    <span
      data-testid="status-plan"
      className={
        strong
          ? "inline-flex items-center rounded-full bg-foreground text-background text-xs font-semibold px-3 py-1"
          : outline
            ? "inline-flex items-center rounded-full border border-foreground text-foreground text-xs font-semibold px-3 py-1"
            : "inline-flex items-center rounded-full bg-secondary text-muted-foreground text-xs font-semibold px-3 py-1"
      }
    >
      {labels[state]}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useUser();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { data: billing, isLoading } = useBillingStatus();
  const portal = useCreatePortal();
  const { toast } = useToast();
  const { query: notifQuery, mutation: notifMutation } = useNotificationPreferences();
  const [notifOptOut, setNotifOptOut] = useState<boolean | null>(null);

  // Sync local toggle state when preferences load
  useEffect(() => {
    if (notifQuery.data !== undefined && notifOptOut === null) {
      setNotifOptOut(notifQuery.data.optOut);
    }
  }, [notifQuery.data, notifOptOut]);

  // Handle OAuth redirect-back params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mailResult = readMailOAuthResult(window.location.search);
    if (mailResult?.result === "connected") {
      const label = MAIL_PROVIDER_LABELS[mailResult.provider];
      toast({ title: `${label} connected`, description: "Your inbox will be scanned shortly." });
      void queryClient.invalidateQueries({ queryKey: ["mail"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (mailResult?.result === "error") {
      toast({
        title: `${MAIL_PROVIDER_LABELS[mailResult.provider]} connection failed`,
        description: "Please try again. Make sure to allow the requested permissions.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("checkout") === "success") {
      toast({ title: "Subscription activated", description: "Your plan has been updated." });
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("checkout") === "cancel") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location, toast, queryClient]);

  const accessState = resolveAccessState(billing);
  const isPro = isPaidLike(billing);
  const isOwner = accessState === "owner";
  const showPlans = !isLoading && !!billing && !isPro && !isOwner && accessState !== "not_started";
  const founding = billing?.foundingEligible === true;

  // Deep links like /settings#upgrade-plans (banner "Upgrade now").
  useEffect(() => {
    if (!showPlans || window.location.hash !== "#upgrade-plans") return;
    const t = setTimeout(() => document.getElementById("upgrade-plans")?.scrollIntoView({ behavior: "smooth" }), 120);
    return () => clearTimeout(t);
  }, [showPlans, location]);

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 w-full">
      <h1 className="text-2xl font-extrabold tracking-tight mb-8">Settings</h1>

      {/* Account */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Account
        </h2>
        <div className="border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Email</span>
            <span className="text-sm text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Name</span>
            <span className="text-sm text-muted-foreground">
              {user?.fullName ?? "—"}
            </span>
          </div>
        </div>
      </section>

      {/* Connected accounts */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Connected accounts
        </h2>

        <MailConnections />
      </section>

      {/* Subscription */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Subscription
        </h2>

        {isLoading ? (
          <div className="border rounded-xl p-5 space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : (
          <div className="border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current plan</span>
              <AccessBadge billing={billing} />
            </div>

            {billing?.paymentAttention && (
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="payment-attention">
                <p className="font-semibold">Your renewal payment needs attention</p>
                <p className="mt-1">
                  {isOwner
                    ? "Your Owner access is unchanged, but your subscription has an outstanding payment."
                    : billing.canUseApp && billing.currentPeriodEnd
                      ? `Your Pro access continues until ${formatDateTime(billing.currentPeriodEnd)}. Update your payment details before then to avoid losing access.`
                      : "Your Pro access has ended. Update your payment details and settle the outstanding invoice to restore access."}
                  {" "}Stripe may retry your payment. Use the button below to open Stripe's secure billing portal.
                </p>
              </div>
            )}

            {(accessState === "account_trial" || accessState === "trial_exhausted" || accessState === "trial_expired") && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Trial uploads used</span>
                <span className="text-sm text-muted-foreground font-mono" data-testid="text-trial-uploads-used">
                  {Math.min(billing?.trialUploadsUsed ?? 0, TRIAL_UPLOAD_LIMIT)} of {TRIAL_UPLOAD_LIMIT}
                </span>
              </div>
            )}

            {(accessState === "account_trial" || accessState === "trial_expired") && billing?.trialEndAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{accessState === "trial_expired" ? "Trial ended" : "Trial ends"}</span>
                <span className="text-sm text-muted-foreground" data-testid="text-trial-end">
                  {formatDateTime(billing.trialEndAt)}
                </span>
              </div>
            )}

            {accessState === "legacy_stripe_trial" && billing?.trialEndAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Trial ends</span>
                <span className="text-sm text-muted-foreground">
                  {formatDate(billing.trialEndAt)}
                </span>
              </div>
            )}

            {accessState === "paid" && billing?.currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {billing.cancelAtPeriodEnd ? "Access until" : "Next billing date"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDate(billing.currentPeriodEnd)}
                </span>
              </div>
            )}

            {billing?.ownerAccess && (
              <OwnerAccessNotice hasBillingAccount={billing.hasBillingAccount === true} />
            )}

            {isOwner && !billing?.hasBillingAccount ? null : isPro || isOwner || billing?.paymentAttention ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full mt-2"
                onClick={() =>
                  portal.mutate(undefined, {
                    onError: () =>
                      toast({
                        title: "Something went wrong",
                        description: "Could not open the billing portal. Please try again.",
                        variant: "destructive",
                      }),
                  })
                }
                disabled={portal.isPending}
              >
                {portal.isPending ? "Loading..." : billing?.paymentAttention ? "Update payment details" : "Manage subscription"}
              </Button>
            ) : (
              showPlans && (
                <Button
                  size="sm"
                  className="rounded-full mt-2"
                  data-testid="button-upgrade-early"
                  onClick={() => {
                    document.getElementById("upgrade-plans")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {accessState === "account_trial" ? "Upgrade now" : "Subscribe"}
                </Button>
              )
            )}
          </div>
        )}
      </section>

      {/* Notifications */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Notifications
        </h2>
        <div className="border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Email reminders</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receive an email before return windows expire (7 days and 2 days out).
              </p>
            </div>
            {notifQuery.isLoading || notifOptOut === null ? (
              <Skeleton className="h-6 w-10 rounded-full" />
            ) : (
              <Switch
                checked={!notifOptOut}
                disabled={notifMutation.isPending}
                onCheckedChange={(enabled) => {
                  const newOptOut = !enabled;
                  setNotifOptOut(newOptOut);
                  notifMutation.mutate(newOptOut, {
                    onError: () => {
                      setNotifOptOut(notifOptOut);
                      toast({
                        title: "Something went wrong",
                        description: "Could not update notification preferences. Please try again.",
                        variant: "destructive",
                      });
                    },
                    onSuccess: ({ optOut }) => {
                      setNotifOptOut(optOut);
                      queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] });
                    },
                  });
                }}
              />
            )}
          </div>
          <PushNotificationSettings />
        </div>
      </section>

      <PrivacyAndDataSettings />

      {/* Plan comparison */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Plan features
        </h2>
        <div className="border rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 px-5 py-3 bg-secondary/50 text-xs font-semibold border-b">
            <span className="text-muted-foreground">Feature</span>
            <span className="text-center text-muted-foreground">Free trial</span>
            <span className="text-center">Pro</span>
          </div>
          {[
            { feature: "Receipt uploads", free: `${TRIAL_UPLOAD_LIMIT} total`, pro: "Unlimited", freeHighlight: false, proHighlight: false },
            { feature: "AI receipt extraction", free: true, pro: true, freeHighlight: false, proHighlight: false },
                        { feature: "Access period", free: "7 days", pro: "While subscribed", freeHighlight: false, proHighlight: false },
            { feature: "Natural-language search", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Warranty reminders", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Email auto-import", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Export & download", free: true, pro: true, freeHighlight: false, proHighlight: false },
          ].map(({ feature, free, pro }) => {
            const renderCell = (val: boolean | string, isProCol: boolean) => {
              if (val === true) {
                return (
                  <span className="flex justify-center">
                    <Check className={`w-4 h-4 ${isProCol ? "text-foreground" : "text-muted-foreground"}`} />
                  </span>
                );
              }
              if (val === false) {
                return (
                  <span className="flex justify-center">
                    <Minus className="w-4 h-4 text-muted-foreground/40" />
                  </span>
                );
              }
              return (
                <span className={`text-center text-xs ${isProCol ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {val}
                </span>
              );
            };
            return (
              <div key={feature} className="grid grid-cols-3 items-center px-5 py-3 text-sm border-b last:border-b-0">
                <span className="font-medium">{feature}</span>
                {renderCell(free, false)}
                {renderCell(pro, true)}
              </div>
            );
          })}
        </div>
      </section>

      {showPlans && (
        <section id="upgrade-plans" className="scroll-mt-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {accessState === "account_trial" ? "Upgrade now" : "Subscribe"}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {accessState === "account_trial"
              ? "Subscribing ends your free trial and starts your paid plan today."
              : "Pick a plan to keep scanning and searching your receipts."}
          </p>
          <PlanChoice founding={founding} />
          <FoundingNote founding={founding} className="mt-4 !text-left" />
        </section>
      )}
    </div>
  );
}
