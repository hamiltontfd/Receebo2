import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { fadeInUp, slideInLeft, slideInRight, stagger, Placeholder, VIEWPORT, SectionLabel } from "./shared";

const fields = [
  "Merchant name",
  "Products & line items",
  "Date & time",
  "Prices & totals",
  "Warranty period",
  "Category",
];

export default function AIExtractionSection() {
  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left — copy + fields */}
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
            className="flex flex-col gap-8"
          >
            <div>
              <motion.div variants={fadeInUp}>
                <SectionLabel>AI extraction</SectionLabel>
              </motion.div>
              <motion.h2
                variants={fadeInUp}
                className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4"
              >
                Receebo understands
                <br />
                your receipts.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-muted-foreground leading-relaxed">
                Our AI reads every detail so you don't have to. In under 10 seconds,
                your receipt is fully indexed and ready to search.
              </motion.p>
            </div>

            {/* Field chips */}
            <motion.div
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            >
              {fields.map((field) => (
                <motion.div
                  key={field}
                  variants={fadeInUp}
                  className="flex items-center gap-2.5 bg-background border border-border rounded-xl px-3.5 py-2.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-sm font-medium text-foreground/80">{field}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right — illustration placeholder */}
          <motion.div
            variants={slideInRight}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
          >
            <Placeholder
              label="AI Illustration Placeholder"
              className="w-full h-[420px] lg:h-[480px]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
