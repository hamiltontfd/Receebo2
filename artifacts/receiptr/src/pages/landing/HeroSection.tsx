import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { useCreateCheckout } from "@/hooks/useBilling";
import { ArrowRight, Play } from "lucide-react";
import { fadeInUp, slideInRight, stagger, VIEWPORT, Placeholder } from "./shared";

export default function HeroSection() {
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();

  const handleTrial = () => {
    if (isSignedIn) {
      checkout.mutate("yearly");
    }
  };

  return (
    <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
      {/* Subtle radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 60% -10%, hsl(220 100% 97%) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 60%, hsl(260 80% 97%) 0%, transparent 65%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — Copy */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-7 max-w-xl"
          >
            {/* Eyebrow */}
            <motion.div variants={fadeInUp}>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/5 border border-primary/10 px-4 py-1.5 text-xs font-semibold text-foreground/70">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                AI-powered receipt management
              </span>
            </motion.div>

            {/* Headline */}
            <motion.div variants={fadeInUp} className="space-y-1">
              <h1 className="text-6xl sm:text-7xl lg:text-[80px] font-extrabold tracking-tighter leading-[0.93] text-foreground">
                Receipts.
                <br />
                <span className="text-foreground/80">Easy to find.</span>
              </h1>
            </motion.div>

            {/* Sub */}
            <motion.p
              variants={fadeInUp}
              className="text-lg text-muted-foreground leading-relaxed max-w-md"
            >
              Scan, upload or forward receipts. Find any purchase in seconds with
              AI-powered search.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3 pt-1">
              {isSignedIn ? (
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    size="lg"
                    onClick={handleTrial}
                    disabled={checkout.isPending}
                    className="rounded-full h-13 px-8 text-base font-semibold gap-2 shadow-sm"
                  >
                    {checkout.isPending ? "Loading…" : "Start your 7-day free trial"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </motion.div>
              ) : (
                <Link href="/sign-up?plan=yearly">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      size="lg"
                      className="rounded-full h-13 px-8 text-base font-semibold gap-2 shadow-sm w-full"
                    >
                      Start your 7-day free trial
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </motion.div>
                </Link>
              )}

              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="rounded-full h-13 px-8 text-base font-medium gap-2 w-full sm:w-auto"
                >
                  <a href="#demo">
                    <Play className="w-3.5 h-3.5 fill-current" />
                    See it in action
                  </a>
                </Button>
              </motion.div>
            </motion.div>

            {/* Social proof line */}
            <motion.p variants={fadeInUp} className="text-xs text-muted-foreground">
              7-day free trial. Cancel anytime. No hidden fees.
            </motion.p>
          </motion.div>

          {/* Right — Product visual placeholder */}
          <motion.div
            variants={slideInRight}
            initial="hidden"
            animate="visible"
            className="relative"
          >
            <Placeholder
              label="Hero Image Placeholder"
              className="w-full h-[420px] lg:h-[500px]"
            />
            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute -bottom-4 -left-4 bg-background rounded-2xl border border-border shadow-lg px-4 py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <span className="text-green-600 text-sm">✓</span>
              </div>
              <div>
                <p className="text-xs font-semibold leading-none mb-0.5">Receipt found</p>
                <p className="text-[10px] text-muted-foreground">MacBook Pro · Apple Store · Jul 2024</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
