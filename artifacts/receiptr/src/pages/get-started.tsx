import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRIAL_UPLOAD_LIMIT } from "@/hooks/useBilling";

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

export default function GetStarted() {
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  // Already signed in — PlanSelectionGate inside ProtectedShell handles gating.
  // Send them straight to the app; the gate will intercept if needed.
  useEffect(() => {
    if (isSignedIn) {
      setLocation("/search");
    }
  }, [isSignedIn, setLocation]);

  if (isSignedIn) return null;

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Minimal nav */}
      <header className="flex h-14 px-5 items-center justify-between border-b">
        <Link href="/">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </Link>
        <img src="/logo.svg" alt="Receebo" className="h-7 w-auto" />
        <Link href="/sign-in">
          <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign in
          </span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-12">
        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10 max-w-md"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Start your free trial
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
            15 days free.<br />No card needed.
          </h1>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
            Create an account and try Receebo for 15 days. Add up to {TRIAL_UPLOAD_LIMIT} receipts.
            Nothing is charged unless you choose a plan.
          </p>
          <Link href="/sign-up" className="inline-flex mt-6 h-11 items-center rounded-full bg-foreground px-7 text-sm font-semibold text-background" data-testid="link-get-started-signup">
            Create free account
          </Link>
        </motion.div>

        {/* Plan cards */}
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
              <p className="text-xs text-muted-foreground mt-1">Founding price, charged when you subscribe</p>
            </div>

            <ul className="space-y-2 flex-1 text-xs font-mono">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="w-3.5 h-3.5 shrink-0 text-foreground" />
                  {f}
                </li>
              ))}
            </ul>

            <Link href="/sign-up">
              <Button variant="outline" size="sm" className="w-full rounded-full font-semibold">
                Start with the free trial
              </Button>
            </Link>
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
              <p className="font-bold text-lg tracking-tight mb-1">Pro Yearly</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-bold font-mono tracking-tight">€24.99</span>
                <span className="text-sm opacity-70">/ year</span>
              </div>
              <p className="text-xs opacity-60 mt-1">Founding price, charged when you subscribe</p>
            </div>

            <ul className="space-y-2 flex-1 text-xs font-mono">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 opacity-80">
                  <Check className="w-3.5 h-3.5 shrink-0 opacity-100" />
                  {f}
                </li>
              ))}
            </ul>

            <Link href="/sign-up">
              <Button
                size="sm"
                className="w-full rounded-full font-semibold bg-background text-foreground hover:bg-background/90"
              >
                Start with the free trial
              </Button>
            </Link>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-6 text-xs text-muted-foreground text-center"
        >
          After the trial, choose a plan when you are ready. Founding prices stay available for as long as your account exists, including if you resubscribe later.
        </motion.p>
      </main>
    </div>
  );
}
