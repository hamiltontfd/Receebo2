import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, MotionConfig } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { useCreateCheckout } from "@/hooks/useBilling";

// Sections
import HeroSection from "./landing/HeroSection";
import DemoSection from "./landing/DemoSection";
import WhyReceeboSection from "./landing/WhyReceeboSection";
import AIExtractionSection from "./landing/AIExtractionSection";
import EmailReceiptsSection from "./landing/EmailReceiptsSection";
import ConsumerProtectionSection from "./landing/ConsumerProtectionSection";
import ComparisonSection from "./landing/ComparisonSection";
import PricingSection from "./landing/PricingSection";
import FAQSection from "./landing/FAQSection";
import FinalCTASection from "./landing/FinalCTASection";

/* ── Scroll-aware nav ──────────────────────────────────────────────────── */
function useScrolled(threshold = 40) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/* ── Main Component ────────────────────────────────────────────────────── */
export default function Landing() {
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();
  const scrolled = useScrolled(40);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">

        {/* ── Nav ─────────────────────────────────────────────────────── */}
        <motion.header
          className="fixed top-0 left-0 right-0 z-50 px-6 flex items-center justify-between backdrop-blur-xl transition-all duration-300 h-16"
          animate={{
            backgroundColor: scrolled
              ? "hsl(0 0% 100% / 0.94)"
              : "hsl(0 0% 100% / 0)",
            borderBottomWidth: scrolled ? "1px" : "0px",
            borderBottomColor: "hsl(0 0% 91%)",
          }}
        >
          <motion.img
            src="/logo.svg"
            alt="Receebo"
            className="h-7 w-auto"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />

          <motion.div
            className="flex items-center gap-4"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            <Link
              href="/sign-in"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Sign in
            </Link>

            {isSignedIn ? (
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="sm"
                  onClick={() => checkout.mutate("yearly")}
                  disabled={checkout.isPending}
                  className="rounded-full font-semibold text-sm px-4"
                >
                  Start free trial
                </Button>
              </motion.div>
            ) : (
              <Link href="/sign-up?plan=yearly">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="sm"
                    className="rounded-full font-semibold text-sm px-4"
                  >
                    Start free trial
                  </Button>
                </motion.div>
              </Link>
            )}
          </motion.div>
        </motion.header>

        {/* ── Page Sections ───────────────────────────────────────────── */}
        <main>
          <HeroSection />
          <DemoSection />
          <WhyReceeboSection />
          <AIExtractionSection />
          <EmailReceiptsSection />
          <ConsumerProtectionSection />
          <ComparisonSection />
          <PricingSection />
          <FAQSection />
          <FinalCTASection />
        </main>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="border-t bg-muted/20">
          <div className="max-w-6xl mx-auto px-6 py-10">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-5">
              <div className="flex items-center gap-2.5">
                <img src="/logo.svg" alt="Receebo" className="h-6 w-auto" />
                <span className="text-sm text-muted-foreground">
                  © {new Date().getFullYear()} Receebo. All rights reserved.
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <Link
                  href="/sign-in"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign up
                </Link>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </MotionConfig>
  );
}
