import { motion } from "framer-motion";
import { Mail, Upload, Camera } from "lucide-react";
import { fadeInUp, slideInLeft, stagger, Placeholder, VIEWPORT, SectionLabel } from "./shared";

const methods = [
  { icon: Mail, label: "Forward from Gmail" },
  { icon: Upload, label: "Upload from files" },
  { icon: Camera, label: "Scan with camera" },
];

export default function EmailReceiptsSection() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left — placeholder */}
          <motion.div
            variants={slideInLeft}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
            className="order-2 lg:order-1"
          >
            <Placeholder
              label="Email Placeholder"
              className="w-full h-[380px] lg:h-[440px]"
            />
          </motion.div>

          {/* Right — copy */}
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
            className="flex flex-col gap-7 order-1 lg:order-2"
          >
            <div>
              <motion.div variants={fadeInUp}>
                <SectionLabel>Email receipts</SectionLabel>
              </motion.div>
              <motion.h2
                variants={fadeInUp}
                className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4"
              >
                Not every receipt
                <br />
                is on paper.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-muted-foreground leading-relaxed">
                Connect your Gmail inbox and Receebo automatically detects and
                imports receipts from your email — no forwarding needed. Works
                alongside camera scanning and file uploads.
              </motion.p>
            </div>

            {/* Method pills */}
            <motion.div variants={stagger} className="flex flex-col gap-3">
              {methods.map(({ icon: Icon, label }) => (
                <motion.div
                  key={label}
                  variants={fadeInUp}
                  className="flex items-center gap-3.5 bg-muted/30 rounded-xl px-4 py-3.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm shrink-0">
                    <Icon className="w-4 h-4 text-foreground/70" />
                  </div>
                  <span className="text-sm font-semibold">{label}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
