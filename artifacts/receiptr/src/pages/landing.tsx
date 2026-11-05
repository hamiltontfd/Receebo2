import { useState, useEffect } from "react";
import DisputeResolutionLine from "@/components/DisputeResolutionLine";
import { Link } from "wouter";
import { motion, MotionConfig } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { MarketSelector } from "@/components/MarketSelector";
import { UncoveredMarketNotice } from "@/components/UncoveredMarketNotice";
import { lt } from "@/lib/landingLocale";
import { useAppLocale } from "@/lib/locale";
import { useCreateCheckout } from "@/hooks/useBilling";
import type { ReactNode } from "react";
import { sendLandingEvent } from "@/lib/landingBeacon";
import { useLandingCta } from "./landing/useLandingCta";
import UsReturnsSection from "./landing/UsReturnsSection";

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
import HowItWorksSection from "./landing/HowItWorksSection";
import SecuritySection from "./landing/SecuritySection";

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
export default function Landing({ variant }: { variant?: "us" } = {}) {
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();
  const us = variant === "us";
  // Aggregate landing_view count (no id, no cookie, nothing stored in the browser).
  // Counted here, in the interactive app only, so the build-time snapshot and its
  // first hydration pass don't count a second view.
  useEffect(() => { sendLandingEvent("landing_view", us ? "/us" : "/"); }, [us]);
  return <LandingContent variant={variant} isSignedIn={!!isSignedIn} checkout={isSignedIn ? checkout : undefined}
    marketSelector={<MarketSelector variant="compact" className="-mr-1 sm:mr-0" />} />;
}

// Shared by the build-time renderer and the interactive authenticated app.
// Provider-independent: no Clerk/API hooks here (the snapshot has no providers).
export function LandingContent({ variant, isSignedIn = false, checkout, marketSelector }: {
  variant?: "us";
  isSignedIn?: boolean;
  checkout?: { mutate: (plan: "monthly" | "yearly") => void; isPending: boolean };
  marketSelector?: ReactNode;
}) {
  const scrolled = useScrolled(40);
  const locale = useAppLocale();
  const us = variant === "us";
  const onCta = useLandingCta(us ? "/us" : "/", isSignedIn);

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
            {marketSelector}
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

            <Link href={isSignedIn ? "/search" : "/sign-up"} data-testid="link-nav-trial" onClick={onCta}>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" className="rounded-full font-semibold text-sm px-4">
                  {isSignedIn ? lt("Open app", "Abrir app") : lt("Start free", "Começar grátis")}
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </header>

        {/* Visitors from a country Receebo doesn't cover yet (server GeoIP). */}
        <UncoveredMarketNotice variant="floating" />

        {/* ── Page Sections ───────────────────────────────────────────── */}
        <main>
          <HeroSection isSignedIn={isSignedIn} variant={variant} />
          {/* /us: the video, demo and screenshots show € receipts and EU rules, so they are left out until US captures exist. */}
          {!us && <PromoVideoSection />}
          {!us && <DemoSection />}
          {!us && <WhyReceeboSection />}
          <EmailReceiptsSection />
          {us ? <UsReturnsSection /> : <ConsumerProtectionSection />}
          <HowItWorksSection variant={variant} />
          <SecuritySection />
          <ComparisonSection />
          <PricingSection checkout={checkout} />
          <FAQSection />
          <FinalCTASection isSignedIn={isSignedIn} />
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
