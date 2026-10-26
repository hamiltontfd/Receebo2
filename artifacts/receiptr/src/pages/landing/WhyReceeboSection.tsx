import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { AppCapture } from "./MarketingMedia";

const FEATURES = [
  {
    title: "Capture",
    items: ["Scan paper receipts", "Upload PDF, JPG or PNG", "Import receipts from your inbox"],
    image: "capture-poster.webp",
    alt: "Receebo's real review form displaying Northline Audio, 20 October 2026 and a €189 total from a fictional receipt.",
  },
  {
    title: "Find",
    items: ["Search by product", "Search by merchant", "Search by brand or category"],
    image: "find-poster.webp",
    alt: "A search for headphones in the real Receebo interface finds the fictional Northline Audio purchase.",
  },
  {
    title: "Protect",
    items: ["Warranty reminders", "Return window alerts", "Consumer rights info"],
    image: "protection.webp",
    alt: "Actual consumer-rights information for the sample Portugal purchase, including return and legal warranty dates.",
  },
  {
    title: "Prove",
    items: ["Fullscreen receipt view", "Download as PDF", "Share proof of purchase"],
    image: "original-receipt.webp",
    alt: "Receebo's original receipt viewer showing the fictional Northline Audio receipt, with €169 headphones and a €20 case.",
  },
];

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 1, 1] as const },
  }),
};

export default function WhyReceeboSection() {
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);

  const goTo = (idx: number) => {
    setDir(idx > active ? 1 : -1);
    setActive(idx);
  };

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
                aria-pressed={i === active}
                className="relative flex-1 py-4 text-sm font-semibold transition-colors focus-visible:outline-none"
                style={{
                  color: i === active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                {f.title}
                {/* Manual tabs keep detailed screenshots readable without auto-advance. */}
                {i === active && (
                  <span
                    className="absolute bottom-0 left-0 h-0.5 bg-foreground rounded-full"
                    style={{ width: "100%" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Slide content */}
          <div className="grid md:grid-cols-2 min-h-[420px]">
            {/* Left — content */}
            <div className="flex items-center p-8 md:p-12 border-b md:border-b-0">
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
                  <AppCapture
                    file={feature.image}
                    alt={feature.alt}
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
