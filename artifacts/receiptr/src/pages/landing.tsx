import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useSpring,
  useMotionValue,
  AnimatePresence,
  type Variants,
} from "framer-motion";
import { Camera, Search, ShieldCheck, Zap, FileText, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuestMode } from "@/components/GuestProvider";
import { useAuth } from "@clerk/react";
import { useCreateCheckout } from "@/hooks/useBilling";

/* ─── Data ──────────────────────────────────────────────────────────────── */
const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Snap or upload",
    body: "Take a photo of any receipt or upload a JPEG, PNG, or PDF from your phone or desktop.",
    icon: ScanLine,
  },
  {
    step: "02",
    title: "AI reads it",
    body: "Our AI extracts the merchant, date, total, items, and even warranty info in seconds.",
    icon: Zap,
  },
  {
    step: "03",
    title: "Search anything",
    body: 'Ask in plain English — "coffee last month" or "MacBook receipt" — and get instant results.',
    icon: Search,
  },
];

const FEATURES = [
  {
    icon: FileText,
    title: "Everything in one place",
    body: "Paper receipts, email attachments, PDFs. They all land in the same searchable library.",
  },
  {
    icon: Search,
    title: "Natural-language search",
    body: "No folders, no tags. Just type what you remember and find the receipt in seconds.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Your receipts are yours alone. We never share or sell your purchase data.",
  },
  {
    icon: Camera,
    title: "Works anywhere",
    body: "Camera-first on mobile, upload-first on desktop. Use it however feels natural.",
  },
];

const SAMPLE_RECEIPTS = [
  { merchant: "Apple Store", category: "Electronics", amount: "$1,299.00", date: "Jul 12" },
  { merchant: "Whole Foods", category: "Groceries", amount: "$68.42", date: "Jul 10" },
  { merchant: "Nike", category: "Apparel", amount: "$124.95", date: "Jul 7" },
  { merchant: "Delta Airlines", category: "Travel", amount: "$389.00", date: "Jun 30" },
  { merchant: "IKEA", category: "Home", amount: "$214.50", date: "Jun 28" },
];

const STATS = [
  { value: 10, suffix: "s", label: "Average extraction time", prefix: "<\u00a0" },
  { value: 3, suffix: " formats", label: "JPG, PNG, PDF — all accepted", prefix: "" },
  { value: 100, suffix: "%", label: "Private — your data stays yours", prefix: "" },
];

/* ─── Animation variants ─────────────────────────────────────────────────── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const staggerContainerFast: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

/* ─── Hooks ──────────────────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1400) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  useEffect(() => {
    if (!inView) return;
    let start: number | null = null;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [inView, target, duration]);

  return { count, ref };
}

function useScrollOpacity(threshold = 60) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function StatItem({ value, suffix, label, prefix }: (typeof STATS)[0]) {
  const { count, ref } = useCountUp(value);
  return (
    <motion.div
      variants={fadeUp}
      className="text-center md:text-left flex-1"
    >
      <p className="text-4xl font-extrabold tracking-tight">
        {prefix}
        <span ref={ref}>{count}</span>
        {suffix}
      </p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}

function FloatingReceiptStack() {
  const y1 = useMotionValue(0);
  const y2 = useMotionValue(0);
  const springY1 = useSpring(y1, { stiffness: 40, damping: 15 });
  const springY2 = useSpring(y2, { stiffness: 55, damping: 18 });

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const t = (now - start) / 1000;
      y1.set(Math.sin(t * 0.7) * 8);
      y2.set(Math.sin(t * 0.9 + 1.2) * 6);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [y1, y2]);

  return (
    <div className="relative flex items-center justify-center h-[420px] md:h-auto">
      {/* Background skeleton receipt */}
      <motion.div
        style={{ y: springY2 }}
        initial={{ opacity: 0, rotate: 6, y: 30 }}
        animate={{ opacity: 1, rotate: 3, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="absolute top-6 right-4 md:right-10 w-[260px] rounded-2xl border bg-background shadow-sm overflow-hidden"
      >
        <div className="h-2 bg-foreground" />
        <div className="p-5 space-y-3">
          <div className="h-2.5 bg-muted rounded w-24 animate-pulse" />
          <div className="h-2 bg-muted rounded w-32 animate-pulse" />
          <div className="border-t pt-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-2 bg-muted rounded w-28" />
                <div className="h-2 bg-muted rounded w-10" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Foreground library card */}
      <motion.div
        style={{ y: springY1 }}
        initial={{ opacity: 0, rotate: -4, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, rotate: -1, y: 0, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[280px] md:w-[300px] rounded-2xl border bg-background shadow-xl overflow-hidden"
      >
        {/* Subtle scan-line sweep */}
        <motion.div
          className="absolute inset-0 pointer-events-none z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.06, 0] }}
          transition={{ delay: 1.4, duration: 1.2, repeat: Infinity, repeatDelay: 4 }}
          style={{
            background: "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.12) 50%, transparent 70%)",
          }}
        />

        <div className="border-b px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-sm">Library</span>
          <Search className="w-4 h-4 text-muted-foreground" />
        </div>

        <motion.ul
          className="divide-y"
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
        >
          {SAMPLE_RECEIPTS.map((r) => (
            <motion.li
              key={r.merchant}
              variants={fadeUp}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{r.merchant}</p>
                <p className="text-xs text-muted-foreground">{r.category} · {r.date}</p>
              </div>
              <span className="font-mono text-sm font-medium shrink-0">{r.amount}</span>
            </motion.li>
          ))}
        </motion.ul>

        <div className="border-t px-4 py-3">
          <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <motion.span
              className="text-xs text-muted-foreground"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              coffee last month...
            </motion.span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function Landing() {
  const { enterGuestMode } = useGuestMode();
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();
  const scrolled = useScrollOpacity(40);

  const { scrollY } = useScroll();
  const heroParallaxY = useTransform(scrollY, [0, 500], [0, -60]);

  const startScanning = async () => {
    await enterGuestMode();
    setLocation("/scan");
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground overflow-x-hidden">
      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <motion.header
        className="px-6 py-4 flex items-center justify-between z-20 sticky top-0 backdrop-blur-md transition-colors duration-300"
        animate={{
          backgroundColor: scrolled ? "hsl(0 0% 100% / 0.92)" : "hsl(0 0% 100% / 0)",
          borderBottomWidth: scrolled ? "1px" : "0px",
          borderBottomColor: "hsl(0 0% 90%)",
          borderBottomStyle: "solid",
        }}
        transition={{ duration: 0.25 }}
      >
        <motion.img
          src="/logo.svg"
          alt="Receebo"
          className="h-8 w-auto"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        >
          <Link
            href="/sign-in"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
          >
            Sign In
          </Link>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Button size="sm" className="rounded-full" onClick={startScanning}>
              Free trial
            </Button>
          </motion.div>
        </motion.div>
      </motion.header>

      <main className="flex-1">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b">
          {/* Subtle background radial */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ y: heroParallaxY }}
            aria-hidden
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-[0.04]"
              style={{ background: "radial-gradient(circle, #000 0%, transparent 70%)" }}
            />
          </motion.div>

          <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center relative z-10">
            {/* Copy stagger */}
            <motion.div
              className="flex flex-col gap-7"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={fadeUp}>
                <span className="inline-flex items-center gap-2 rounded-full border bg-secondary/70 px-3 py-1 text-xs font-semibold text-muted-foreground mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/60 inline-block" />
                  AI-powered receipt management
                </span>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]">
                  Receipts.<br />Easy to find.
                </h1>
              </motion.div>

              <motion.p
                variants={fadeUp}
                className="text-lg text-muted-foreground max-w-md leading-relaxed"
              >
                Snap or upload receipts. Search for items you bought. Find them in seconds.
              </motion.p>

              <motion.div
                variants={fadeUp}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
              >
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="lg"
                    className="rounded-full h-14 px-8 text-base font-semibold w-full sm:w-auto"
                    onClick={startScanning}
                  >
                    Scan your first receipt
                  </Button>
                </motion.div>
                <Link href="/sign-up" className="sm:inline-flex">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                    <Button
                      variant="outline"
                      size="lg"
                      className="rounded-full h-14 px-8 text-base font-medium w-full"
                    >
                      Create an account
                    </Button>
                  </motion.div>
                </Link>
              </motion.div>
            </motion.div>

            {/* Animated receipt stack */}
            <FloatingReceiptStack />
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section className="border-b overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <motion.div
              className="mb-12"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                How it works
              </p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                From crumpled paper<br />to searchable record in seconds.
              </h2>
            </motion.div>

            <motion.div
              className="grid md:grid-cols-3 gap-8"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              {HOW_IT_WORKS.map(({ step, title, body, icon: Icon }) => (
                <motion.div key={step} variants={fadeUp} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <motion.span
                      className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shrink-0"
                      whileInView={{ rotate: [0, -8, 4, 0], scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.6, delay: Number(step) * 0.15 }}
                      viewport={{ once: true }}
                    >
                      <Icon className="w-5 h-5" />
                    </motion.span>
                    <span className="text-xs font-semibold text-muted-foreground tracking-widest">
                      {step}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Features grid ────────────────────────────────────────────── */}
        <section className="border-b bg-secondary/40 overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <motion.div
              className="mb-12"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Features
              </p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Built for the receipt<br />you always lose.
              </h2>
            </motion.div>

            <motion.div
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <motion.div
                  key={title}
                  variants={fadeUp}
                  whileHover={{
                    y: -6,
                    boxShadow: "0 16px 32px rgba(0,0,0,0.10)",
                    transition: { duration: 0.25 },
                  }}
                  className="bg-background rounded-2xl border p-6 flex flex-col gap-4 cursor-default"
                >
                  <motion.span
                    className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center"
                    whileHover={{ rotate: [0, -6, 4, 0], scale: 1.08 }}
                    transition={{ duration: 0.4 }}
                  >
                    <Icon className="w-5 h-5" />
                  </motion.span>
                  <div>
                    <h3 className="font-bold mb-1.5">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <section className="border-b overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <motion.div
              className="mb-12 text-center"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Pricing
              </p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Simple, honest pricing.
              </h2>
              <p className="text-muted-foreground mt-3 max-w-sm mx-auto text-sm">
                Start free, upgrade when you need unlimited uploads.
              </p>
            </motion.div>

            <motion.div
              className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              {/* Free */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="bg-background rounded-2xl border p-6 flex flex-col gap-4"
              >
                <div>
                  <p className="font-bold text-lg">Free</p>
                  <p className="text-3xl font-extrabold mt-1">€0</p>
                  <p className="text-xs text-muted-foreground mt-1">forever</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                  <li>5 uploads per day</li>
                  <li>AI extraction</li>
                  <li>Natural-language search</li>
                  <li>Warranty reminders</li>
                </ul>
                {isSignedIn ? (
                  <Link href="/scan">
                    <Button variant="outline" size="sm" className="rounded-full w-full">
                      Get started
                    </Button>
                  </Link>
                ) : (
                  <Link href="/sign-up">
                    <Button variant="outline" size="sm" className="rounded-full w-full">
                      Get started
                    </Button>
                  </Link>
                )}
              </motion.div>

              {/* Monthly — hero card */}
              <motion.div
                variants={fadeUp}
                whileInView={{
                  boxShadow: [
                    "0 0 0 0 rgba(0,0,0,0)",
                    "0 0 0 4px rgba(0,0,0,0.12)",
                    "0 0 0 0 rgba(0,0,0,0)",
                  ],
                }}
                transition={{ delay: 0.4, duration: 1.0, times: [0, 0.5, 1] }}
                viewport={{ once: true }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="bg-foreground text-background rounded-2xl border border-foreground p-6 flex flex-col gap-4 relative overflow-hidden"
              >
                {/* Shimmer */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ x: "-100%", opacity: 0 }}
                  whileInView={{ x: "200%", opacity: [0, 0.08, 0] }}
                  transition={{ delay: 0.6, duration: 1.2 }}
                  viewport={{ once: true }}
                  style={{
                    background:
                      "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
                  }}
                />
                <div>
                  <p className="font-bold text-lg">Pro Monthly</p>
                  <p className="text-3xl font-extrabold mt-1">€2.99</p>
                  <p className="text-xs opacity-60 mt-1">per month</p>
                </div>
                <ul className="space-y-2 text-sm opacity-80 flex-1">
                  <li>Unlimited uploads</li>
                  <li>AI extraction</li>
                  <li>Natural-language search</li>
                  <li>Warranty reminders</li>
                  <li>7-day free trial</li>
                </ul>
                {isSignedIn ? (
                  <Button
                    size="sm"
                    className="rounded-full w-full bg-background text-foreground hover:bg-background/90"
                    onClick={() => checkout.mutate("monthly")}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Start free trial"}
                  </Button>
                ) : (
                  <Link href="/sign-up?plan=monthly">
                    <Button
                      size="sm"
                      className="rounded-full w-full bg-background text-foreground hover:bg-background/90"
                    >
                      Start free trial
                    </Button>
                  </Link>
                )}
              </motion.div>

              {/* Yearly */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="bg-background rounded-2xl border p-6 flex flex-col gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg">Pro Yearly</p>
                    <span className="text-xs bg-secondary rounded-full px-2 py-0.5 font-semibold">
                      Save 30%
                    </span>
                  </div>
                  <p className="text-3xl font-extrabold mt-1">€24.99</p>
                  <p className="text-xs text-muted-foreground mt-1">per year</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                  <li>Unlimited uploads</li>
                  <li>AI extraction</li>
                  <li>Natural-language search</li>
                  <li>Warranty reminders</li>
                  <li>7-day free trial</li>
                </ul>
                {isSignedIn ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full w-full"
                    onClick={() => checkout.mutate("yearly")}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Start free trial"}
                  </Button>
                ) : (
                  <Link href="/sign-up?plan=yearly">
                    <Button variant="outline" size="sm" className="rounded-full w-full">
                      Start free trial
                    </Button>
                  </Link>
                )}
              </motion.div>
            </motion.div>

            <motion.p
              className="text-center text-sm text-muted-foreground mt-8"
              variants={fadeIn}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              7-day free trial. We'll remind you before your trial ends. Cancel anytime with one click.
            </motion.p>
          </div>
        </section>

        {/* ── Stats strip ─────────────────────────────────────────────── */}
        <section className="border-b overflow-hidden">
          <motion.div
            className="max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row items-center gap-8 md:gap-16"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            {STATS.map((stat) => (
              <StatItem key={stat.label} {...stat} />
            ))}
          </motion.div>
        </section>

        {/* ── Bottom CTA ──────────────────────────────────────────────── */}
        <section className="overflow-hidden">
          <motion.div
            className="max-w-3xl mx-auto px-6 py-28 text-center flex flex-col items-center gap-7"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.div variants={fadeUp} className="relative">
              {/* Glow behind heading */}
              <div
                className="absolute inset-0 -z-10 blur-3xl opacity-[0.06] scale-150"
                style={{ background: "radial-gradient(circle, #000 0%, transparent 70%)" }}
                aria-hidden
              />
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
                Stop losing receipts.<br />Start in 30 seconds.
              </h2>
            </motion.div>

            <motion.p
              variants={fadeUp}
              className="text-lg text-muted-foreground max-w-sm"
            >
              No account required. Try it right now with any receipt you have nearby.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto"
            >
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  className="rounded-full h-14 px-10 text-base font-semibold w-full"
                  onClick={startScanning}
                >
                  Scan a receipt now
                </Button>
              </motion.div>
              <Link href="/sign-up" className="sm:inline-flex">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full h-14 px-10 text-base font-medium w-full"
                  >
                    Create free account
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <motion.footer
        className="border-t py-8 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground"
        variants={fadeIn}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <img src="/logo.svg" alt="Receebo" className="h-7 w-auto" />
        <p>&copy; {new Date().getFullYear()} Receebo. All rights reserved.</p>
        <div className="flex gap-5">
          <Link href="/sign-in" className="hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up" className="hover:text-foreground transition-colors">
            Sign Up
          </Link>
        </div>
      </motion.footer>
    </div>
  );
}
