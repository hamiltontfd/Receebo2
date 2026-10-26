import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateCheckout, MONTHLY_PRICE, YEARLY_PRICE } from "@/hooks/useBilling";

export const PAID_FEATURES = [
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
 * Explicit paid plan selection. Clicking a plan opens Stripe Checkout and the
 * first charge happens immediately — there is no Stripe trial.
 */
export function PlanChoice({ founding }: { founding: boolean }) {
  const checkout = useCreateCheckout();
  const plans = [
    { key: "monthly" as const, name: "Monthly", price: MONTHLY_PRICE, period: "/ month", highlight: false },
    { key: "yearly" as const, name: "Yearly", price: YEARLY_PRICE, period: "/ year", highlight: true },
  ];
  const pending = checkout.isPending ? checkout.variables : null;

  return (
    <div className="w-full max-w-2xl grid sm:grid-cols-2 gap-4">
      {plans.map((p, i) => (
        <motion.div
          key={p.key}
          custom={i}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className={
            p.highlight
              ? "border-2 border-foreground rounded-2xl p-6 flex flex-col gap-5 bg-foreground text-background"
              : "border-2 border-border rounded-2xl p-6 flex flex-col gap-5 bg-background"
          }
          data-testid={`card-plan-${p.key}`}
        >
          <div>
            <p className="font-bold text-lg tracking-tight">
              {founding ? `Founding ${p.name}` : `Pro ${p.name}`}
            </p>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-4xl font-bold font-mono tracking-tight">{p.price}</span>
              <span className={p.highlight ? "text-sm opacity-70" : "text-sm text-muted-foreground"}>{p.period}</span>
            </div>
            <p className={p.highlight ? "text-xs opacity-60 mt-1" : "text-xs text-muted-foreground mt-1"}>
              Charged today, renews {p.key === "monthly" ? "monthly" : "yearly"} until cancelled
            </p>
          </div>
          <ul className="space-y-2 flex-1 text-xs font-mono">
            {PAID_FEATURES.map((f) => (
              <li key={f} className={p.highlight ? "flex items-center gap-2 opacity-80" : "flex items-center gap-2 text-muted-foreground"}>
                <Check className={p.highlight ? "w-3.5 h-3.5 shrink-0" : "w-3.5 h-3.5 shrink-0 text-foreground"} />
                {f}
              </li>
            ))}
          </ul>
          <Button
            variant={p.highlight ? "default" : "outline"}
            size="sm"
            className={
              p.highlight
                ? "w-full rounded-full font-semibold bg-background text-foreground hover:bg-background/90"
                : "w-full rounded-full font-semibold"
            }
            disabled={checkout.isPending}
            onClick={() => checkout.mutate(p.key)}
            data-testid={`button-subscribe-${p.key}`}
          >
            {pending === p.key ? <Loader2 className="w-4 h-4 animate-spin" /> : `Subscribe ${p.price}${p.period.replace(" ", "")}`}
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export function FoundingNote({ founding, className = "" }: { founding: boolean; className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground text-center leading-relaxed ${className}`} data-testid="text-founding-note">
      {founding
        ? "Founding prices apply for as long as your account exists, including if you cancel and resubscribe later. "
        : ""}
      You're charged when you subscribe. Cancel renewal anytime from the billing portal.
    </p>
  );
}
