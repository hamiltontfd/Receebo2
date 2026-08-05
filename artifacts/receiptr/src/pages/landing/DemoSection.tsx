import { motion } from "framer-motion";
import { fadeInUp, stagger, VideoPlaceholder, VIEWPORT, SectionLabel } from "./shared";

const demos = [
  {
    title: "Capture",
    body: "Scan, upload or forward receipts in seconds.",
  },
  {
    title: "Find",
    body: "Search products, stores or brands and instantly find the receipt you need.",
  },
  {
    title: "Protect",
    body: "Track warranties and return windows automatically.",
  },
];

export default function DemoSection() {
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
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="grid md:grid-cols-3 gap-6"
        >
          {demos.map(({ title, body }) => (
            <motion.div
              key={title}
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-background rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
            >
              {/* Video placeholder */}
              <VideoPlaceholder className="rounded-none border-0 border-b border-dashed border-border/70 bg-muted/20" />

              {/* Text */}
              <div className="p-6 flex flex-col gap-2">
                <h3 className="font-bold text-lg tracking-tight">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
