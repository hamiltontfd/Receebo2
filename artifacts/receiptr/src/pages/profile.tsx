import { useClerk, useUser } from "@clerk/react";
import { useLocation, Link } from "wouter";
import { LogOut, CreditCard, ChevronRight, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useGuestMode } from "@/components/GuestProvider";
import { useBillingStatus, useCreatePortal } from "@/hooks/useBilling";
import { format } from "date-fns";

function Initials({ name, email }: { name: string | null; email: string | null }) {
  const text = name?.trim() || email?.trim() || "?";
  const parts = text.split(/\s+/);
  const letters =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : text.slice(0, 2).toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full bg-foreground text-background flex items-center justify-center text-2xl font-bold shrink-0 select-none">
      {letters}
    </div>
  );
}

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

export default function ProfilePage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { isGuest, guestUser, exitGuestMode } = useGuestMode();
  const { data: billing, isLoading: billingLoading } = useBillingStatus();
  const portal = useCreatePortal();
  const { toast } = useToast();

  const handleSignOut = () => {
    if (isGuest) {
      exitGuestMode();
      setLocation("/");
    } else {
      signOut({ redirectUrl: "/" });
    }
  };

  const handleManageSubscription = () => {
    portal.mutate(undefined, {
      onError: () =>
        toast({
          title: "Something went wrong",
          description: "Could not open the billing portal. Please try again.",
          variant: "destructive",
        }),
    });
  };

  const isPro = billing?.plan === "pro" || billing?.plan === "trialing";

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    return format(new Date(iso), "MMMM d, yyyy");
  };

  // ── Guest view ─────────────────────────────────────────────────────────────
  if (isGuest) {
    return (
      <div className="max-w-md mx-auto px-6 py-12 w-full flex flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
            <UserCircle2 className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-lg">Guest</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your receipts are stored locally. Create an account to save them.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/sign-up">
            <Button size="lg" className="w-full rounded-full">
              Create a free account
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="outline" size="lg" className="w-full rounded-full">
              Sign in
            </Button>
          </Link>
        </div>

        <div className="border-t pt-6">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-between py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-4 h-4" />
              <span>Exit guest mode</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Signed-in view ─────────────────────────────────────────────────────────
  const displayName = user?.fullName || null;
  const email = user?.primaryEmailAddress?.emailAddress || null;

  return (
    <div className="max-w-md mx-auto px-6 py-12 w-full flex flex-col gap-8">

      {/* ── Identity ── */}
      <div className="flex items-center gap-5">
        <Initials name={displayName} email={email} />
        <div className="min-w-0">
          {displayName && (
            <p className="font-bold text-xl leading-tight truncate">{displayName}</p>
          )}
          <p className="text-sm text-muted-foreground truncate mt-0.5">{email ?? "—"}</p>
        </div>
      </div>

      {/* ── Subscription ── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Subscription
        </h2>

        <div className="border rounded-xl divide-y">
          {/* Plan row */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm font-medium">Current plan</span>
            {billingLoading ? (
              <Skeleton className="h-5 w-20 rounded-full" />
            ) : (
              <PlanBadge plan={billing?.plan ?? "free"} />
            )}
          </div>

          {/* Trial end date */}
          {!billingLoading && billing?.plan === "trialing" && billing.trialEndAt && (
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-medium">Trial ends</span>
              <span className="text-sm text-muted-foreground">
                {formatDate(billing.trialEndAt)}
              </span>
            </div>
          )}

          {/* Billing period */}
          {!billingLoading && billing?.plan === "pro" && billing.currentPeriodEnd && (
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-medium">
                {billing.cancelAtPeriodEnd ? "Access until" : "Next billing date"}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatDate(billing.currentPeriodEnd)}
              </span>
            </div>
          )}

          {/* Cancelled notice */}
          {!billingLoading && billing?.plan === "pro" && billing.cancelAtPeriodEnd && (
            <div className="px-4 py-3.5">
              <p className="text-xs text-muted-foreground">
                Your subscription is cancelled and will not renew.
              </p>
            </div>
          )}

          {/* Actions */}
          {!billingLoading && (
            <div className="px-4 py-3.5 flex flex-col gap-2">
              {isPro ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full w-full"
                  onClick={handleManageSubscription}
                  disabled={portal.isPending}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {portal.isPending ? "Loading…" : "Manage subscription"}
                </Button>
              ) : (
                <Link href="/settings#upgrade-plans">
                  <Button size="sm" className="rounded-full w-full">
                    Upgrade to Pro
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>

        {isPro && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Cancel anytime from the Stripe billing portal.
          </p>
        )}
      </section>

      {/* ── Account actions ── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Account
        </h2>
        <div className="border rounded-xl divide-y">
          <Link href="/settings">
            <button className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-secondary/50 transition-colors rounded-t-xl">
              <span className="font-medium">Settings</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-destructive hover:bg-destructive/5 transition-colors rounded-b-xl"
          >
            <div className="flex items-center gap-2.5">
              <LogOut className="w-4 h-4" />
              <span className="font-medium">Sign out</span>
            </div>
            <ChevronRight className="w-4 h-4 opacity-50" />
          </button>
        </div>
      </section>
    </div>
  );
}
