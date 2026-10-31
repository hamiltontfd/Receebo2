import { useState, useEffect } from "react";
import DisputeResolutionLine from "@/components/DisputeResolutionLine";
import { Link } from "wouter";
import { motion, MotionConfig } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { MarketSelector } from "@/components/MarketSelector";
import { lt } from "@/lib/landingLocale";
import { useAppLocale } from "@/lib/locale";
import { LanguageSelector } from "@/components/LanguageSelector";

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
  const locale = useAppLocale();

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">

        {/* ── Nav ─────────────────────────────────────────────────────── */}
        <header
          // Keep the glass surface constant: CSS transition-all competing with
          // Motion's background/border animation caused unstable compositing.
          className={`fixed top-0 left-0 right-0 z-50 isolate px-6 flex items-center justify-between bg-white/85 backdrop-blur-xl border-b transition-[border-color] duration-300 h-16 ${scrolled ? "border-border" : "border-transparent"}`}
          style={{ transform: "translateZ(0)" }}
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
            className="flex items-center gap-2 sm:gap-4"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            <MarketSelector variant="compact" className="-mr-1 sm:mr-0" />
            <div className="hidden sm:block"><LanguageSelector compact /></div>
            <Link href="/sign-in" className="hidden md:inline-block">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white font-semibold text-sm text-foreground px-4 hover:bg-white/90"
                >
                  {lt("Sign in", "Entrar")}
                </Button>
              </motion.div>
            </Link>

            <Link href={isSignedIn ? "/search" : "/sign-up"} data-testid="link-nav-trial">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" className="rounded-full font-semibold text-sm px-4">
                  {isSignedIn ? lt("Open app", "Abrir app") : lt("Start free", "Começar grátis")}
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </header>

        {/* ── Page Sections ───────────────────────────────────────────── */}
        <main>
          <div className="sm:hidden px-6 pt-20 flex justify-end"><LanguageSelector /></div>
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
                  © {new Date().getFullYear()} Receebo. {lt("All rights reserved.", "Todos os direitos reservados.")}
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <Link
                  href="/privacy"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {lt("Privacy", "Privacidade")}
                </Link>
                <Link
                  href="/terms"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {lt("Terms", "Termos")}
                </Link>
                <Link
                  href="/sign-in"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {lt("Sign in", "Entrar")}
                </Link>
                <Link
                  href="/sign-up"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {lt("Sign up", "Criar conta")}
                </Link>
              </div>
            </div>
            <DisputeResolutionLine locale={locale === "en" ? "en" : "pt"} className="mt-5 text-xs text-muted-foreground text-center sm:text-left" />
          </div>
        </footer>

      </div>
    </MotionConfig>
  );
}
