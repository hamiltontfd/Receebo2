import { useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useBillingStatus, useCreateCheckout, useCreatePortal } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

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
              <div className="pt-2 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Upgrade to Pro for unlimited uploads.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => checkout.mutate("monthly")}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Monthly — €2.99/mo"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => checkout.mutate("yearly")}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Yearly — €24.99/yr"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">7-day free trial included.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Limits */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Plan features
        </h2>
        <div className="border rounded-xl divide-y">
          {[
            { feature: "Daily uploads", free: "5/day", pro: "Unlimited" },
            { feature: "AI extraction", free: "Included", pro: "Included" },
            { feature: "Natural-language search", free: "Included", pro: "Included" },
            { feature: "Warranty reminders", free: "Included", pro: "Included" },
          ].map(({ feature, free, pro }) => (
            <div key={feature} className="grid grid-cols-3 px-5 py-3 text-sm">
              <span className="font-medium">{feature}</span>
              <span className="text-muted-foreground text-center">{free}</span>
              <span className="text-center font-semibold">{pro}</span>
            </div>
          ))}
          <div className="grid grid-cols-3 px-5 py-2 text-xs text-muted-foreground">
            <span />
            <span className="text-center font-semibold">Free</span>
            <span className="text-center font-semibold">Pro</span>
          </div>
        </div>
      </section>
    </div>
  );
}
