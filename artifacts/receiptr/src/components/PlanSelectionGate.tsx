import { useRef } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClerk } from "@clerk/react";
import { useBillingStatus, useCreateCheckout } from "@/hooks/useBilling";

const PLAN_STORAGE_KEY = "receebo:pendingPlan";

const FEATURES = [
  "Unlimited receipt scans",
  "AI-powered data extraction",
  "Natural-language search",
  "Attachment storage",
  "Warranty reminders",
  "Export & download",
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const, delay: i * 0.08 },
  }),
};

/**
 * Wraps any protected route. If the signed-in user has no active subscription
 * (plan === "free"), shows a plan-selection screen and starts Stripe Checkout
 * directly — no sign-up redirect needed. Children only render once the user
 * has an active trial or paid subscription.
 */
export function PlanSelectionGate({ children }: { children: React.ReactNode }) {
  const { data: billing, isLoading } = useBillingStatus();
  const checkout = useCreateCheckout();

  // If PostAuthCheckout already captured a ?plan= and is about to redirect
  // to Stripe, show a spinner instead of flashing the gate.
  const hasPendingRedirect = useRef(
    typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(PLAN_STORAGE_KEY) !== null,
  );

  // Show loader while billing loads OR while a checkout redirect is in-flight
  if (isLoading || hasPendingRedirect.current || checkout.isPending) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Active trial or paid — let them in
  if (billing?.plan !== "free") {
    return <>{children}</>;
  }

  const { signOut } = useClerk();

  // No subscription — show plan picker
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <header className="flex h-14 px-5 items-center justify-between border-b">
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
        <img src="/logo.svg" alt="Receebo" className="h-7 w-auto" />
        <div className="w-16" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10 max-w-md"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            One more step
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
            7 days free,<br />no charge until it ends.
          </h1>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
            Pick a plan to unlock Receebo. Cancel anytime before your trial ends and you won't be charged.
          </p>
        </motion.div>

        <div className="w-full max-w-2xl grid sm:grid-cols-2 gap-4">
          {/* Monthly */}
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="border-2 border-border rounded-2xl p-6 flex flex-col gap-5 bg-background"
          >
            <div>
              <p className="font-bold text-lg tracking-tight">Pro Monthly</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-bold font-mono tracking-tight">€2.99</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">after 7-day free trial</p>
            </div>

            <ul className="space-y-2 flex-1 text-xs font-mono">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="w-3.5 h-3.5 shrink-0 text-foreground" />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-full font-semibold"
              disabled={checkout.isPending}
              onClick={() => checkout.mutate("monthly")}
            >
              {checkout.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Start free trial"
              )}
            </Button>
          </motion.div>

          {/* Yearly — highlighted */}
          <motion.div
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="border-2 border-foreground rounded-2xl p-6 flex flex-col gap-5 bg-foreground text-background relative overflow-hidden"
          >
            {/* Shimmer */}
            <motion.div
              className="absolute inset-0 pointer-events-none opacity-[0.06]"
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ delay: 0.6, duration: 1.4 }}
              style={{
                background:
                  "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.9) 50%, transparent 70%)",
              }}
            />

            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-bold text-lg tracking-tight">Pro Yearly</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background/20 border border-background/30 text-background">
                  Save 30%
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-bold font-mono tracking-tight">€24.99</span>
                <span className="text-sm opacity-70">/ year</span>
              </div>
              <p className="text-xs opacity-60 mt-1">after 7-day free trial · €2.08/mo billed annually</p>
            </div>

            <ul className="space-y-2 flex-1 text-xs font-mono">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 opacity-80">
                  <Check className="w-3.5 h-3.5 shrink-0 opacity-100" />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              size="sm"
              className="w-full rounded-full font-semibold bg-background text-foreground hover:bg-background/90"
              disabled={checkout.isPending}
              onClick={() => checkout.mutate("yearly")}
            >
              {checkout.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-foreground" />
              ) : (
                "Start free trial"
              )}
            </Button>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-6 text-xs text-muted-foreground text-center"
        >
          No charge for 7 days. Cancel before trial ends and pay nothing.
        </motion.p>
      </main>
    </div>
  );
}
