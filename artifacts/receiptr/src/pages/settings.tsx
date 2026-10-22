import { OwnerAccessNotice } from "@/components/OwnerAccessNotice";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useBillingStatus, useCreateCheckout, useCreatePortal } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Check, Minus, Mail, Loader2, RefreshCw, PlugZap } from "lucide-react";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";
import { PrivacyAndDataSettings } from "@/components/PrivacyAndDataSettings";

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

// ─── Gmail connection ─────────────────────────────────────────────────────────

interface GmailStatus {
  configured: boolean;
  connected: boolean;
  gmailEmail: string | null;
  lastSyncedAt: string | null;
  pendingCount: number;
}

async function fetchGmailStatus(): Promise<GmailStatus> {
  const res = await fetch(`${BASE}api/gmail/status`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load Gmail status");
  return res.json() as Promise<GmailStatus>;
}

async function disconnectGmail(): Promise<void> {
  const res = await fetch(`${BASE}api/gmail/disconnect`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to disconnect");
}

async function triggerSync(): Promise<{ checked: number; queued: number }> {
  const res = await fetch(`${BASE}api/gmail/sync`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json() as Promise<{ checked: number; queued: number }>;
}

function useGmailStatus() {
  return useQuery<GmailStatus>({
    queryKey: ["gmail", "status"],
    queryFn: fetchGmailStatus,
    staleTime: 60_000,
    retry: false,
  });
}

// ─── Plan badge ───────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: "free" | "trialing" | "pro" }) {
  if (plan === "pro") {
    return (
      <span className="inline-flex items-center rounded-full bg-foreground text-background text-xs font-semibold px-3 py-1">
        Pro
      </span>
    );
  }
  if (plan === "trialing") {
    return (
      <span className="inline-flex items-center rounded-full border border-foreground text-foreground text-xs font-semibold px-3 py-1">
        Pro Trial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-secondary text-muted-foreground text-xs font-semibold px-3 py-1">
      Free
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useUser();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { data: billing, isLoading } = useBillingStatus();
  const checkout = useCreateCheckout();
  const portal = useCreatePortal();
  const { toast } = useToast();
  const { query: notifQuery, mutation: notifMutation } = useNotificationPreferences();
  const [notifOptOut, setNotifOptOut] = useState<boolean | null>(null);

  const { data: gmailStatus, isLoading: gmailLoading } = useGmailStatus();

  const disconnectMutation = useMutation({
    mutationFn: disconnectGmail,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gmail"] });
      toast({ title: "Gmail disconnected" });
    },
    onError: () =>
      toast({
        title: "Something went wrong",
        description: "Could not disconnect Gmail. Please try again.",
        variant: "destructive",
      }),
  });

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["gmail"] });
      if (result.queued > 0) {
        toast({
          title: `Found ${result.queued} new receipt${result.queued > 1 ? "s" : ""}`,
          description: "Check your pending imports.",
        });
      } else {
        toast({ title: "No new receipts found" });
      }
    },
    onError: () =>
      toast({
        title: "Sync failed",
        description: "Could not reach Gmail. Try again shortly.",
        variant: "destructive",
      }),
  });

  // Sync local toggle state when preferences load
  useEffect(() => {
    if (notifQuery.data !== undefined && notifOptOut === null) {
      setNotifOptOut(notifQuery.data.optOut);
    }
  }, [notifQuery.data, notifOptOut]);

  // Handle OAuth redirect-back params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      toast({ title: "Gmail connected", description: "Your inbox will be scanned shortly." });
      void queryClient.invalidateQueries({ queryKey: ["gmail"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("gmail") === "error") {
      toast({
        title: "Gmail connection failed",
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

  const isPro = billing?.plan === "pro" || billing?.plan === "trialing";

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

        <div className="border rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Gmail</p>
                {gmailLoading ? (
                  <Skeleton className="h-3 w-32 mt-1" />
                ) : gmailStatus?.connected ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {gmailStatus.gmailEmail ?? "Connected"}
                    {gmailStatus.lastSyncedAt && (
                      <> · Last synced {formatDateTime(gmailStatus.lastSyncedAt)}</>
                    )}
                    {gmailStatus.pendingCount > 0 && (
                      <> ·{" "}
                        <span className="font-semibold text-foreground">
                          {gmailStatus.pendingCount} pending
                        </span>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Auto-import receipt PDFs from your inbox
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {gmailLoading ? (
                <Skeleton className="h-8 w-20 rounded-full" />
              ) : gmailStatus?.connected ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-8 text-xs text-muted-foreground"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending || disconnectMutation.isPending}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full h-8 text-xs"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending || syncMutation.isPending}
                  >
                    {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
                  </Button>
                </>
              ) : gmailStatus?.configured === false ? (
                <span className="text-xs text-muted-foreground italic">
                  Not configured
                </span>
              ) : (
                <a href={`${BASE}api/gmail/connect`}>
                  <Button size="sm" className="rounded-full h-8 text-xs gap-1.5">
                    <PlugZap className="w-3 h-3" />
                    Connect Gmail
                  </Button>
                </a>
              )}
            </div>
          </div>

          {!gmailStatus?.configured && !gmailLoading && (
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
              Gmail auto-import requires a Google OAuth integration. Contact the app administrator to enable it.
            </p>
          )}
        </div>
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
              {billing?.ownerAccess ? (
                <span className="text-sm font-semibold">Owner access</span>
              ) : (
                <PlanBadge plan={billing?.plan ?? "free"} />
              )}
            </div>

            {billing?.plan === "trialing" && billing.trialEndAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Trial ends</span>
                <span className="text-sm text-muted-foreground">
                  {formatDate(billing.trialEndAt)}
                </span>
              </div>
            )}

            {billing?.plan === "pro" && billing.currentPeriodEnd && (
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

            {billing?.ownerAccess && !billing.hasBillingAccount ? null : isPro ? (
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
                {portal.isPending ? "Loading..." : "Manage subscription"}
              </Button>
            ) : (
              <Button
                size="sm"
                className="rounded-full mt-2"
                onClick={() => {
                  document.getElementById("upgrade-plans")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Upgrade to Pro
              </Button>
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
            <span className="text-center text-muted-foreground">Free</span>
            <span className="text-center">Pro</span>
          </div>
          {[
            { feature: "Daily uploads", free: "Unlimited", pro: "Unlimited", freeHighlight: false, proHighlight: false },
            { feature: "AI receipt extraction", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Attachment uploads", free: "Unlimited", pro: "Unlimited", freeHighlight: false, proHighlight: false },
            { feature: "Natural-language search", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Warranty reminders", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Gmail auto-import", free: true, pro: true, freeHighlight: false, proHighlight: false },
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

      {!isPro && !isLoading && (
        <section id="upgrade-plans">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Upgrade to Pro
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border rounded-xl p-5 flex flex-col gap-4">
              <div>
                <p className="font-bold">Pro Monthly</p>
                <p className="text-2xl font-extrabold mt-1">€2.99</p>
                <p className="text-xs text-muted-foreground">per month</p>
              </div>
              <Button
                size="sm"
                className="rounded-full"
                onClick={() =>
                  checkout.mutate("monthly", {
                    onError: () =>
                      toast({
                        title: "Something went wrong",
                        description: "Could not start checkout. Please try again.",
                        variant: "destructive",
                      }),
                  })
                }
                disabled={checkout.isPending}
              >
                {checkout.isPending ? "Loading..." : "Start 7-day free trial"}
              </Button>
            </div>
            <div className="border rounded-xl p-5 flex flex-col gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold">Pro Yearly</p>
                  <span className="text-xs bg-secondary rounded-full px-2 py-0.5 font-semibold">Save 30%</span>
                </div>
                <p className="text-2xl font-extrabold mt-1">€24.99</p>
                <p className="text-xs text-muted-foreground">per year</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  checkout.mutate("yearly", {
                    onError: () =>
                      toast({
                        title: "Something went wrong",
                        description: "Could not start checkout. Please try again.",
                        variant: "destructive",
                      }),
                  })
                }
                disabled={checkout.isPending}
              >
                {checkout.isPending ? "Loading..." : "Start 7-day free trial"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            7-day free trial. We'll remind you before your trial ends. Cancel anytime with one click.
          </p>
        </section>
      )}
    </div>
  );
}
