import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { useCreateCheckout } from "@/hooks/useBilling";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { cn } from "@/lib/utils";

const features = [
  "Unlimited scans",
  "Unlimited storage",
  "AI extraction",
  "Warranty tracking",
  "Email imports",
  "Return reminders",
  "Priority processing",
];

const plans = [
  {
    key: "monthly" as const,
    name: "Monthly",
    price: "€2.99",
    period: "/month",
    badge: null,
    highlight: false,
  },
  {
    key: "yearly" as const,
    name: "Yearly",
    price: "€24.99",
    period: "/year",
    badge: null,
    highlight: true,
  },
];

export default function PricingSection() {
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();

  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-14"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>Pricing</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            Simple, transparent pricing.
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground mt-3 text-lg">
            Try it free for seven days with three receipt uploads, no card needed. Subscribe only if you want to keep going.
          </motion.p>
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto"
        >
          {plans.map(({ key, name, price, period, badge, highlight }) => (
            <motion.div
              key={key}
              variants={fadeInUp}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className={cn(
                "relative rounded-2xl border-2 p-7 flex flex-col gap-6",
                highlight
                  ? "border-foreground bg-foreground text-background shadow-xl"
                  : "border-border bg-background shadow-sm",
              )}
            >
              {/* Shimmer on highlight */}
              {highlight && (
                <motion.div
                  className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
                  initial={{ x: "-100%" }}
                  whileInView={{ x: "200%" }}
                  transition={{ delay: 0.5, duration: 1.4 }}
                  viewport={{ once: true }}
                  style={{
                    background:
                      "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.07) 50%, transparent 70%)",
                  }}
                />
              )}

              {/* Header */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg tracking-tight">{name}</h3>
                  {badge && (
                    <span
                      className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-full",
                        highlight
                          ? "bg-white/15 text-white"
                          : "bg-foreground/8 text-foreground/70 border border-border",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight">{price}</span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      highlight ? "text-white/60" : "text-muted-foreground",
                    )}
                  >
                    {period}
                  </span>
                </div>
                <p
                  className={cn(
                    "text-xs mt-2",
                    highlight ? "text-white/50" : "text-muted-foreground",
                  )}
                >
                  Founding price, charged when you subscribe
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check
                      className={cn(
                        "w-4 h-4 shrink-0",
                        highlight ? "text-white/70" : "text-foreground/60",
                      )}
                      strokeWidth={2.5}
                    />
                    <span className={highlight ? "text-white/90" : ""}>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isSignedIn ? (
                <Button
                  onClick={() => checkout.mutate(key)}
                  disabled={checkout.isPending}
                  variant={highlight ? "outline" : "default"}
                  className={cn(
                    "w-full rounded-full font-semibold",
                    highlight &&
                      "border-white/30 text-white hover:bg-white/10 bg-white/10",
                  )}
                >
                  {checkout.isPending ? "Loading…" : `Subscribe ${price}${period}`}
                </Button>
              ) : (
                <Link href="/sign-up">
                  <Button
                    variant={highlight ? "outline" : "default"}
                    className={cn(
                      "w-full rounded-full font-semibold",
                      highlight &&
                        "border-white/30 text-white hover:bg-white/10 bg-white/10",
                    )}
                  >
                    Start free, no card needed
                  </Button>
                </Link>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* Fine print */}
        <motion.p
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center text-sm text-muted-foreground mt-8"
        >
          Founding prices stay available for as long as your account exists, including if you cancel and resubscribe. Cancel renewal anytime.
        </motion.p>
      </div>
    </section>
  );
}
