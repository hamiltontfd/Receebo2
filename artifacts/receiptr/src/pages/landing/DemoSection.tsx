import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Play } from "lucide-react";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { marketingMedia } from "./MarketingMedia";
import DemoVideoModal from "./DemoVideoModal";

const demos = [
  {
    title: "Capture",
    body: "Scan, upload or import receipts in seconds.",
    clip: "capture",
    description: "A sample receipt image is selected, its extracted merchant, date and €189 total are reviewed, and the purchase is saved. Extraction responses are simulated for this recording.",
  },
  {
    title: "Find",
    body: "Search products, stores or brands and instantly find the receipt you need.",
    clip: "find",
    description: "Typing “headphones” filters the sample library to Northline Audio. Opening the result shows the purchased items and the original receipt.",
  },
  {
    title: "Protect",
    body: "View available warranty and return information.",
    clip: "protect",
    description: "The sample online purchase shows its manufacturer warranty and Portugal-specific return and legal warranty information. Dates depend on purchase details; eligibility and exclusions must be checked with the seller.",
  },
];

export default function DemoSection() {
  const [activeDemo, setActiveDemo] = useState<(typeof demos)[number] | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const reduce = useReducedMotion();
  const showDemo = (demo: (typeof demos)[number]) => {
    setActiveDemo(demo);
    setVideoOpen(true);
  };

  return (
    <section id="demo" className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-16"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>In action</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            See Receebo in action
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-sm text-muted-foreground mt-4 max-w-2xl mx-auto">
            Real app recordings with fictional sample data and simulated extraction.
            No live email connection is shown.
          </motion.p>
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="grid md:grid-cols-3 gap-6"
        >
          {demos.map((demo) => {
            const { title, body, clip, description } = demo;
            return (
            <motion.div
              key={title}
              variants={fadeInUp}
              whileHover={reduce ? undefined : { y: -4, transition: { duration: 0.2 } }}
              className="bg-background rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
            >
              <button
                type="button"
                data-demo={clip}
                onClick={() => showDemo(demo)}
                aria-label={`Play ${title} demo`}
                aria-haspopup="dialog"
                className="group relative block w-full aspect-video overflow-hidden bg-muted/20 border-b border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
              >
                <img
                  src={marketingMedia(`${clip}-poster.webp`)}
                  alt=""
                  width={960}
                  height={640}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg motion-safe:transition-transform motion-safe:group-hover:scale-110">
                    <Play className="h-5 w-5 ml-0.5 fill-current text-foreground" aria-hidden="true" />
                  </span>
                </span>
              </button>

              {/* Text */}
              <div className="p-6 flex flex-col gap-2">
                <h3 className="font-bold text-lg tracking-tight">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                <details className="text-xs text-muted-foreground mt-2">
                  <summary className="cursor-pointer font-medium text-foreground">What this demo shows</summary>
                  <p id={`${clip}-description`} className="mt-2 leading-relaxed">{description}</p>
                  <button type="button" onClick={() => showDemo(demo)} className="inline-block mt-2 underline">
                    Watch {title.toLowerCase()} video
                  </button>
                </details>
              </div>
            </motion.div>
            );
          })}
        </motion.div>
      </div>
      <DemoVideoModal demo={activeDemo} open={videoOpen} onOpenChange={setVideoOpen} />
    </section>
  );
}
