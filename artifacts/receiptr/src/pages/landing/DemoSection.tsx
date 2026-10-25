import { motion } from "framer-motion";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { marketingMedia } from "./MarketingMedia";

const demos = [
  {
    title: "Capture",
    body: "Scan, upload or forward receipts in seconds.",
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
            Silent clips play only when you choose. No live email connection is shown.
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
          {demos.map(({ title, body, clip, description }) => (
            <motion.div
              key={title}
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-background rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
            >
              <video
                controls
                playsInline
                preload="none"
                poster={marketingMedia(`${clip}-poster.webp`)}
                width={960}
                height={640}
                aria-label={`${title}: real Receebo screen recording using sample data`}
                aria-describedby={`${clip}-description`}
                className="w-full aspect-video object-contain bg-muted/20 border-b border-border"
              >
                <source src={marketingMedia(`${clip}.webm`)} type="video/webm" />
                <source src={marketingMedia(`${clip}.mp4`)} type="video/mp4" />
                Your browser cannot play this clip. Read the demonstration description below.
              </video>

              {/* Text */}
              <div className="p-6 flex flex-col gap-2">
                <h3 className="font-bold text-lg tracking-tight">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                <details className="text-xs text-muted-foreground mt-2">
                  <summary className="cursor-pointer font-medium text-foreground">What this demo shows</summary>
                  <p id={`${clip}-description`} className="mt-2 leading-relaxed">{description}</p>
                  <a href={marketingMedia(`${clip}.mp4`)} className="inline-block mt-2 underline">Open {title.toLowerCase()} video</a>
                </details>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
