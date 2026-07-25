import { useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useBillingStatus, useCreateCheckout, useCreatePortal } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, Minus } from "lucide-react";

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

export default function Settings() {
  const { user } = useUser();
  const [location] = useLocation();
  const { data: billing, isLoading } = useBillingStatus();
  const checkout = useCreateCheckout();
  const portal = useCreatePortal();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast({ title: "Subscription activated", description: "Your plan has been updated." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("checkout") === "cancel") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location, toast]);

  const isPro = billing?.plan === "pro" || billing?.plan === "trialing";

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
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
              <PlanBadge plan={billing?.plan ?? "free"} />
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

            {billing?.plan === "free" && (
              <p className="text-sm text-muted-foreground">
                Free plan — 5 uploads per day.
              </p>
            )}

            {isPro ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full mt-2"
                onClick={() => portal.mutate()}
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

      {/* Plan comparison */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Plan features
        </h2>
        <div className="border rounded-xl overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-3 px-5 py-3 bg-secondary/50 text-xs font-semibold border-b">
            <span className="text-muted-foreground">Feature</span>
            <span className="text-center text-muted-foreground">Free</span>
            <span className="text-center">Pro</span>
          </div>
          {[
            { feature: "Daily uploads", free: "5 per day", pro: "Unlimited", freeHighlight: false, proHighlight: true },
            { feature: "AI receipt extraction", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Attachment uploads", free: "5 per day (shared)", pro: "Unlimited", freeHighlight: false, proHighlight: true },
            { feature: "Natural-language search", free: true, pro: true, freeHighlight: false, proHighlight: false },
            { feature: "Warranty reminders", free: true, pro: true, freeHighlight: false, proHighlight: false },
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
                onClick={() => checkout.mutate("monthly")}
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
                onClick={() => checkout.mutate("yearly")}
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
