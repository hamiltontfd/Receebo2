import { motion } from "framer-motion";
import { fadeInUp, stagger, Placeholder, VIEWPORT, SectionLabel } from "./shared";

const features = [
  {
    title: "Capture",
    items: ["Scan paper receipts", "Upload PDF, JPG or PNG", "Forward email receipts"],
    placeholder: "Feature Image Placeholder",
  },
  {
    title: "Find",
    items: ["Search by product", "Search by merchant", "Search by brand or category"],
    placeholder: "Feature Image Placeholder",
  },
  {
    title: "Protect",
    items: ["Warranty reminders", "Return window alerts", "Consumer rights info"],
    placeholder: "Feature Image Placeholder",
  },
  {
    title: "Prove",
    items: ["Fullscreen receipt view", "Download as PDF", "Share proof of purchase"],
    placeholder: "Feature Image Placeholder",
  },
];

export default function WhyReceeboSection() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="mb-16"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>Why Receebo</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight max-w-2xl"
          >
            Everything your receipts need.
            <br />
            Nothing they don't.
          </motion.h2>
        </motion.div>

        {/* 2×2 grid */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="grid sm:grid-cols-2 gap-6"
        >
          {features.map(({ title, items, placeholder }) => (
            <motion.div
              key={title}
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-background border border-border rounded-2xl p-6 flex flex-col gap-5 shadow-sm"
            >
              {/* Placeholder illustration */}
              <Placeholder label={placeholder} className="w-full h-44" />

              {/* Content */}
              <div>
                <h3 className="font-bold text-xl tracking-tight mb-3">{title}</h3>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-[11px] font-bold text-foreground/40">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
