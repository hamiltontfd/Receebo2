import { useState, useEffect } from "react";
import DisputeResolutionLine from "@/components/DisputeResolutionLine";
import { Link } from "wouter";
import { motion, MotionConfig } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";

// Sections
import HeroSection from "./landing/HeroSection";
import PromoVideoSection from "./landing/PromoVideoSection";
import DemoSection from "./landing/DemoSection";
import WhyReceeboSection from "./landing/WhyReceeboSection";
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
            <Link href="/sign-in" className="hidden sm:inline-block">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white font-semibold text-sm text-foreground px-4 hover:bg-white/90"
                >
                  Sign in
                </Button>
              </motion.div>
            </Link>

            <Link href={isSignedIn ? "/search" : "/sign-up"} data-testid="link-nav-trial">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" className="rounded-full font-semibold text-sm px-4">
                  {isSignedIn ? "Open app" : "Start free"}
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </motion.header>

        {/* ── Page Sections ───────────────────────────────────────────── */}
        <main>
          <HeroSection />
          <PromoVideoSection />
          <DemoSection />
          <WhyReceeboSection />
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
                  href="/privacy"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy
                </Link>
                <Link
                  href="/terms"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms
                </Link>
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
            <DisputeResolutionLine className="mt-5 text-xs text-muted-foreground text-center sm:text-left" />
          </div>
        </footer>

      </div>
    </MotionConfig>
  );
}
