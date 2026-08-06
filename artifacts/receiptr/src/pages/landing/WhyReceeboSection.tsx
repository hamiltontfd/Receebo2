import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp, stagger, Placeholder, VIEWPORT, SectionLabel } from "./shared";

const FEATURES = [
  {
    title: "Capture",
    items: ["Scan paper receipts", "Upload PDF, JPG or PNG", "Forward email receipts"],
    placeholder: "Capture illustration",
  },
  {
    title: "Find",
    items: ["Search by product", "Search by merchant", "Search by brand or category"],
    placeholder: "Find illustration",
  },
  {
    title: "Protect",
    items: ["Warranty reminders", "Return window alerts", "Consumer rights info"],
    placeholder: "Protect illustration",
  },
  {
    title: "Prove",
    items: ["Fullscreen receipt view", "Download as PDF", "Share proof of purchase"],
    placeholder: "Prove illustration",
  },
];

const SLIDE_DURATION = 4000; // ms per slide

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 1, 1] },
  }),
};

export default function WhyReceeboSection() {
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const goTo = (idx: number) => {
    setDir(idx > active ? 1 : -1);
    setActive(idx);
    setProgress(0);
    startTimeRef.current = Date.now();
  };

  // Progress animation via rAF
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      setProgress(Math.min(elapsed / SLIDE_DURATION, 1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Auto-advance
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setDir(1);
      setActive((prev) => {
        const next = (prev + 1) % FEATURES.length;
        return next;
      });
      setProgress(0);
      startTimeRef.current = Date.now();
    }, SLIDE_DURATION);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);

  const feature = FEATURES[active];

  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="mb-12"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>Why Receebo</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight max-w-2xl"
          >
            Forgot where or when?
            <br />
            We got you.
          </motion.h2>
        </motion.div>

        {/* Slideshow card */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="bg-background border border-border rounded-3xl overflow-hidden shadow-sm"
        >
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {FEATURES.map((f, i) => (
              <button
                key={f.title}
                onClick={() => goTo(i)}
                className="relative flex-1 py-4 text-sm font-semibold transition-colors focus-visible:outline-none"
                style={{
                  color: i === active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                {f.title}
                {/* Progress bar — only on active tab */}
                {i === active && (
                  <span
                    className="absolute bottom-0 left-0 h-0.5 bg-foreground rounded-full"
                    style={{ width: `${progress * 100}%`, transition: "none" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Slide content */}
          <div className="grid lg:grid-cols-2 min-h-[420px]">
            {/* Left — content */}
            <div className="flex items-center p-8 lg:p-12 border-b lg:border-b-0 lg:border-r border-border">
              <AnimatePresence custom={dir} mode="wait">
                <motion.div
                  key={active + "-text"}
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-6 w-full"
                >
                  <h3 className="text-3xl font-extrabold tracking-tight">
                    {feature.title}
                  </h3>
                  <ul className="space-y-4">
                    {feature.items.map((item, i) => (
                      <motion.li
                        key={item}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 + 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center gap-3 text-base text-muted-foreground"
                      >
                        <span className="w-6 h-6 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-[12px] font-bold text-foreground/40">
                          ✓
                        </span>
                        {item}
                      </motion.li>
                    ))}
                  </ul>

                  {/* Dot nav */}
                  <div className="flex gap-2 pt-2">
                    {FEATURES.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goTo(i)}
                        className="h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none"
                        style={{
                          width: i === active ? "24px" : "6px",
                          backgroundColor:
                            i === active
                              ? "hsl(var(--foreground))"
                              : "hsl(var(--foreground) / 0.15)",
                        }}
                        aria-label={`Go to ${FEATURES[i].title}`}
                      />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right — image */}
            <div className="relative overflow-hidden min-h-[280px] lg:min-h-[420px]">
              <AnimatePresence custom={dir} mode="wait">
                <motion.div
                  key={active + "-img"}
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="absolute inset-0 p-6 flex items-center justify-center"
                >
                  <Placeholder
                    label={feature.placeholder}
                    className="w-full h-full"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
