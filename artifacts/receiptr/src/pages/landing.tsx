import { useRef, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useSpring,
  useReducedMotion,
  MotionConfig,
  type Variants,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import { useGuestMode } from "@/components/GuestProvider";
import { useAuth } from "@clerk/react";
import { useCreateCheckout } from "@/hooks/useBilling";

/* ─────────────────────────────────────────────────────────────────────────
   CREATIVE CONCEPT: "THE RECEIPT DRAWER"
   
   Visual metaphor: finding receipts is like pulling open a drawer — sections
   slide and unfold as you scroll. Typography mimics thermal receipt printers
   (monospace, dot leaders, justified totals). Monochrome palette reflects
   the black-ink-on-white-paper nature of receipts. Motion language: mechanical,
   precise, drawer-like reveals with staggered unfolds.
───────────────────────────────────────────────────────────────────────── */

/* ─── Animation Variants ──────────────────────────────────────────────── */
const drawerSlide: Variants = {
  hidden: { opacity: 0, x: -40, scale: 0.96 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

const receiptUnfold: Variants = {
  hidden: { opacity: 0, y: 20, scaleY: 0.92 },
  visible: {
    opacity: 1,
    y: 0,
    scaleY: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

const staggerDrawer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

/* ─── Hooks ────────────────────────────────────────────────────────────── */
function useScrollOpacity(threshold = 40) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function useCountUp(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView) return;
    let start: number | null = null;
    let id: number;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [inView, target, duration]);

  return { count, ref };
}

/* ─── Receipt Drawer Hero Visual ──────────────────────────────────────── */
function ReceiptDrawerHero() {
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const drawerY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const receiptY1 = useTransform(scrollYProgress, [0, 0.6], [0, -60]);
  const receiptY2 = useTransform(scrollYProgress, [0, 0.6], [0, -80]);
  const receiptY3 = useTransform(scrollYProgress, [0, 0.6], [0, -100]);

  // Floating motion
  const floatY = useMotionValue(0);
  const springY = useSpring(floatY, { stiffness: 30, damping: 12 });

  useEffect(() => {
    if (reducedMotion) return;
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const t = (now - start) / 1000;
      floatY.set(Math.sin(t * 0.6) * 6);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [floatY, reducedMotion]);

  return (
    <div ref={containerRef} className="relative h-[520px] flex items-center justify-center overflow-hidden">
      {/* Drawer container */}
      <motion.div
        style={{ y: drawerY }}
        className="relative w-full max-w-[360px] perspective-1000"
      >
        {/* Drawer base — subtle shadow suggesting depth */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="absolute bottom-0 left-0 right-0 h-16 bg-secondary/60 border border-border rounded-b-lg shadow-sm"
          style={{
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          }}
        >
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-border rounded-full" />
        </motion.div>

        {/* Stacked receipts emerging */}
        <motion.div style={{ y: springY }} className="relative z-10 space-y-3 pb-20">
          {/* Receipt 3 — deepest */}
          <motion.div
            style={{ y: receiptY3 }}
            initial={{ opacity: 0, y: 30, rotate: 2 }}
            animate={{ opacity: 0.6, y: 0, rotate: 1.5 }}
            transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[300px] mx-auto bg-background border border-border rounded-lg shadow-md overflow-hidden"
          >
            <div className="h-2 bg-foreground/10" />
            <div className="p-4 space-y-2">
              <div className="h-2 bg-muted/70 rounded w-20" />
              <div className="h-1.5 bg-muted/50 rounded w-24" />
              <div className="border-t border-dashed border-border pt-2 mt-3 space-y-1.5">
                {[1, 2].map((i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <div className="h-1.5 bg-muted/40 rounded w-16" />
                    <div className="h-1.5 bg-muted/40 rounded w-8" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Receipt 2 */}
          <motion.div
            style={{ y: receiptY2 }}
            initial={{ opacity: 0, y: 30, rotate: -1.5 }}
            animate={{ opacity: 0.8, y: 0, rotate: -1 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[320px] mx-auto bg-background border border-border rounded-lg shadow-lg overflow-hidden"
          >
            <div className="h-2 bg-foreground/10" />
            <div className="p-4 space-y-2">
              <div className="h-2 bg-muted/70 rounded w-24" />
              <div className="h-1.5 bg-muted/50 rounded w-28" />
              <div className="border-t border-dashed border-border pt-2 mt-3 space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <div className="h-1.5 bg-muted/40 rounded w-20" />
                    <div className="h-1.5 bg-muted/40 rounded w-10" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Receipt 1 — hero card */}
          <motion.div
            style={{ y: receiptY1 }}
            initial={{ opacity: 0, y: 40, rotate: 0.5, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[340px] mx-auto bg-background border-2 border-foreground/20 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Thermal paper perforation */}
            <div className="h-2.5 bg-foreground flex items-center justify-center gap-1.5">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="w-1 h-1 rounded-full bg-background/30" />
              ))}
            </div>

            <div className="p-5 font-mono text-xs space-y-4">
              {/* Receipt header */}
              <div className="text-center border-b border-dashed border-border pb-3">
                <p className="font-bold text-sm tracking-wider">RECEEBO</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Receipt Management System
                </p>
              </div>

              {/* Sample items */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>MACBOOK PRO 14"</span>
                  <span className="font-semibold">€2,499.00</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>AIRPODS PRO</span>
                  <span>€279.00</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>USB-C CABLE</span>
                  <span>€19.00</span>
                </div>
              </div>

              {/* Total */}
              <div className="border-t-2 border-foreground pt-2">
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL</span>
                  <span>€2,797.00</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                  Apple Store · 12 Jul 2024
                </p>
              </div>

              {/* Search suggestion at bottom */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="border-t border-dashed border-border pt-3 mt-3"
              >
                <div className="bg-secondary/80 rounded px-2.5 py-2 flex items-center gap-2">
                  <div className="w-1 h-1 bg-foreground rounded-full animate-pulse" />
                  <span className="text-[10px] text-muted-foreground italic">
                    "MacBook receipt"
                  </span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ─── Pricing Card Component ──────────────────────────────────────────── */
interface PricingCardProps {
  name: string;
  price: string;
  period: string;
  badge?: string;
  features: string[];
  cta: string;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  variant?: "default" | "primary";
}

function PricingCard({
  name,
  price,
  period,
  badge,
  features,
  cta,
  onClick,
  disabled,
  href,
  variant = "default",
}: PricingCardProps) {
  const isPrimary = variant === "primary";

  const card = (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -6, transition: { duration: 0.25 } }}
      className={`
        relative rounded-2xl border-2 p-6 flex flex-col gap-5 overflow-hidden
        ${isPrimary ? "border-foreground bg-foreground text-background" : "border-border bg-background"}
      `}
    >
      {isPrimary && (
        <motion.div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          initial={{ x: "-100%" }}
          whileInView={{ x: "200%" }}
          transition={{ delay: 0.4, duration: 1.4 }}
          viewport={{ once: true }}
          style={{
            background:
              "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.8) 50%, transparent 70%)",
          }}
        />
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-bold text-lg tracking-tight">{name}</h3>
          {badge && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isPrimary
                  ? "bg-background/20 border-background/30 text-background"
                  : "bg-foreground/5 border-foreground/10"
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold font-mono tracking-tight">{price}</span>
          <span className={`text-sm ${isPrimary ? "opacity-70" : "text-muted-foreground"}`}>
            {period}
          </span>
        </div>
      </div>

      {/* Features — receipt-style list */}
      <ul className="space-y-2.5 flex-1 font-mono text-xs">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={isPrimary ? "opacity-60" : "text-muted-foreground"}>•</span>
            <span className={isPrimary ? "opacity-90" : ""}>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {href ? (
        <Link href={href}>
          <Button
            size="sm"
            variant={isPrimary ? "outline" : "default"}
            className={`w-full rounded-full font-semibold ${
              isPrimary ? "bg-background text-foreground hover:bg-background/90 border-background" : ""
            }`}
          >
            {cta}
          </Button>
        </Link>
      ) : (
        <Button
          size="sm"
          variant={isPrimary ? "outline" : "default"}
          onClick={onClick}
          disabled={disabled}
          className={`w-full rounded-full font-semibold ${
            isPrimary ? "bg-background text-foreground hover:bg-background/90 border-background" : ""
          }`}
        >
          {disabled ? "Loading..." : cta}
        </Button>
      )}
    </motion.div>
  );

  return card;
}

/* ─── Stats Block ─────────────────────────────────────────────────────── */
function StatsBlock() {
  const stats = [
    { value: 10, suffix: "s", label: "Average extraction time", prefix: "<\u00a0" },
    { value: 100, suffix: "%", label: "Private & secure", prefix: "" },
    { value: 3, suffix: "", label: "File formats supported", prefix: "" },
  ];

  return (
    <motion.div
      variants={staggerDrawer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      className="grid sm:grid-cols-3 gap-8 py-16"
    >
      {stats.map((stat) => {
        const { count, ref } = useCountUp(stat.value);
        return (
          <motion.div key={stat.label} variants={fadeInUp} className="text-center">
            <p className="text-5xl font-bold font-mono tracking-tight mb-2">
              {stat.prefix}
              <span ref={ref}>{count}</span>
              {stat.suffix}
            </p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */
export default function Landing() {
  const { enterGuestMode } = useGuestMode();
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();
  const scrolled = useScrollOpacity(40);

  const startScanning = async () => {
    await enterGuestMode();
    setLocation("/scan");
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between backdrop-blur-xl transition-all duration-300"
        animate={{
          backgroundColor: scrolled ? "hsl(0 0% 100% / 0.94)" : "hsl(0 0% 100% / 0)",
          borderBottomWidth: scrolled ? "1px" : "0px",
          borderBottomColor: "hsl(0 0% 90%)",
        }}
      >
        <motion.img
          src="/logo.svg"
          alt="Receebo"
          className="h-8 w-auto"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="flex items-center gap-3"
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
          <Link
            href="/sign-up"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign up
          </Link>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Button size="sm" onClick={startScanning} className="rounded-full font-semibold">
              Try free
            </Button>
          </motion.div>
        </motion.div>
      </motion.header>

      <main>
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="relative pt-32 pb-20 border-b overflow-hidden">
          {/* Subtle grid texture */}
          <div
            className="absolute inset-0 opacity-[0.015] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, hsl(0 0% 0%) 1px, transparent 1px),
                linear-gradient(to bottom, hsl(0 0% 0%) 1px, transparent 1px)
              `,
              backgroundSize: "32px 32px",
            }}
          />

          <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">
            {/* Copy */}
            <motion.div
              variants={staggerDrawer}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-8"
            >
              <motion.div variants={drawerSlide} className="space-y-5">
                <div className="inline-flex items-center gap-2 border border-border bg-secondary/40 rounded-full px-3 py-1.5 text-xs font-semibold">
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" />
                  AI-powered receipt management
                </div>

                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[0.95]">
                  Receipts.
                  <br />
                  Easy to find.
                </h1>

                <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                  Snap or upload any receipt. Search by what you remember. Find it in seconds. No
                  folders, no filing, no lost paper slips.
                </p>
              </motion.div>

              <motion.div
                variants={drawerSlide}
                className="flex flex-col sm:flex-row gap-3"
              >
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="lg"
                    onClick={startScanning}
                    className="rounded-full h-14 px-8 text-base font-semibold w-full sm:w-auto"
                  >
                    Scan your first receipt
                  </Button>
                </motion.div>
                <Link href="/sign-up">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="lg"
                      className="rounded-full h-14 px-8 text-base font-medium w-full"
                    >
                      Create account
                    </Button>
                  </motion.div>
                </Link>
              </motion.div>
            </motion.div>

            {/* Drawer visual */}
            <ReceiptDrawerHero />
          </div>
        </section>

        {/* ── How It Works: Unfold Sections ──────────────────────────── */}
        <section className="border-b bg-secondary/20">
          <div className="max-w-6xl mx-auto px-6 py-24">
            <motion.div
              variants={receiptUnfold}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="mb-16"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 font-mono">
                How it works
              </p>
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
                From crumpled paper
                <br />
                to searchable record.
              </h2>
            </motion.div>

            <motion.div
              variants={staggerDrawer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="grid md:grid-cols-3 gap-8"
            >
              {[
                {
                  step: "01",
                  title: "Snap or upload",
                  body: "Photograph any paper receipt with your phone camera, or upload a PDF, JPG, or PNG from email.",
                },
                {
                  step: "02",
                  title: "AI extracts everything",
                  body: "Merchant name, date, total, line items, even warranty expiry — all read and indexed in under 10 seconds.",
                },
                {
                  step: "03",
                  title: "Search in plain English",
                  body: 'No folders, no tags. Just type "coffee last month" or "MacBook receipt" and it appears instantly.',
                },
              ].map(({ step, title, body }) => (
                <motion.div
                  key={step}
                  variants={receiptUnfold}
                  className="bg-background border-2 border-border rounded-xl p-6 flex flex-col gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center font-mono text-sm font-bold">
                      {step}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-xl mb-2 tracking-tight">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Why People Lose Receipts (Problem → Solution) ────────── */}
        <section className="border-b">
          <div className="max-w-5xl mx-auto px-6 py-24">
            <motion.div
              variants={receiptUnfold}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="text-center mb-12"
            >
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4">
                Built for the receipt you always lose.
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Paper fades. Email threads bury attachments. Folders are never where you left them.
                Receebo finds receipts the way you remember them.
              </p>
            </motion.div>

            <motion.div
              variants={staggerDrawer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="grid sm:grid-cols-2 gap-6"
            >
              {[
                {
                  title: "One library for everything",
                  body: "Paper receipts, email PDFs, scanned documents — all in one searchable place.",
                },
                {
                  title: "Search like you think",
                  body: "No folders, no categories, no tags to remember. Just describe what you bought.",
                },
                {
                  title: "Never lose a warranty",
                  body: "We extract warranty end dates and remind you before they expire.",
                },
                {
                  title: "Private by default",
                  body: "Your purchase history is yours alone. We never share or sell your data.",
                },
              ].map(({ title, body }) => (
                <motion.div
                  key={title}
                  variants={fadeInUp}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="border-2 border-border rounded-xl p-6 bg-background"
                >
                  <h3 className="font-bold text-lg mb-2 tracking-tight">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <section className="border-b bg-secondary/20">
          <div className="max-w-5xl mx-auto px-6">
            <StatsBlock />
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────── */}
        <section className="border-b">
          <div className="max-w-6xl mx-auto px-6 py-24">
            <motion.div
              variants={receiptUnfold}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="text-center mb-12"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 font-mono">
                Pricing
              </p>
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
                Simple, honest pricing.
              </h2>
              <p className="text-muted-foreground mt-3 max-w-md mx-auto">
                Start free forever. Upgrade when you need unlimited uploads.
              </p>
            </motion.div>

            <motion.div
              variants={staggerDrawer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto"
            >
              <PricingCard
                name="Free"
                price="€0"
                period="forever"
                features={[
                  "5 uploads per day",
                  "AI extraction",
                  "Natural-language search",
                  "Warranty reminders",
                ]}
                cta="Get started"
                href={isSignedIn ? "/scan" : "/sign-up"}
              />

              <PricingCard
                name="Pro Monthly"
                price="€2.99"
                period="/mo"
                features={[
                  "Unlimited uploads",
                  "AI extraction",
                  "Natural-language search",
                  "Warranty reminders",
                  "7-day free trial",
                ]}
                cta="Start free trial"
                variant="primary"
                onClick={isSignedIn ? () => checkout.mutate("monthly") : undefined}
                href={isSignedIn ? undefined : "/sign-up?plan=monthly"}
                disabled={checkout.isPending}
              />

              <PricingCard
                name="Pro Yearly"
                price="€24.99"
                period="/yr"
                badge="Save 30%"
                features={[
                  "Unlimited uploads",
                  "AI extraction",
                  "Natural-language search",
                  "Warranty reminders",
                  "7-day free trial",
                ]}
                cta="Start free trial"
                onClick={isSignedIn ? () => checkout.mutate("yearly") : undefined}
                href={isSignedIn ? undefined : "/sign-up?plan=yearly"}
                disabled={checkout.isPending}
              />
            </motion.div>

            <motion.p
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="text-center text-sm text-muted-foreground mt-10"
            >
              7-day free trial. We'll remind you before it ends. Cancel anytime with one click.
            </motion.p>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────── */}
        <section className="py-28">
          <motion.div
            variants={staggerDrawer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="max-w-3xl mx-auto px-6 text-center flex flex-col items-center gap-8"
          >
            <motion.div variants={receiptUnfold} className="space-y-4">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
                Stop losing receipts.
                <br />
                Start in 30 seconds.
              </h2>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                No account required. Scan any receipt right now — see how fast it works.
              </p>
            </motion.div>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  onClick={startScanning}
                  className="rounded-full h-14 px-10 text-base font-semibold"
                >
                  Try it free now
                </Button>
              </motion.div>
              <Link href="/sign-up">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full h-14 px-10 text-base font-medium"
                  >
                    Create account
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t bg-secondary/20">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="Receebo" className="h-6 w-auto" />
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Receebo
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <Link
                href="/sign-in"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}
