import { motion } from "framer-motion";
import { ShieldCheck, Clock, RotateCcw, Scale } from "lucide-react";
import { fadeInUp, slideInRight, stagger, Placeholder, VIEWPORT, SectionLabel } from "./shared";

const protections = [
  {
    icon: RotateCcw,
    title: "Return windows",
    body: "Know exactly how many days you have to return any purchase.",
  },
  {
    icon: ShieldCheck,
    title: "Warranty tracking",
    body: "Get reminded before your product warranties expire.",
  },
  {
    icon: Scale,
    title: "Consumer rights",
    body: "Understand your legal rights for every purchase, by country.",
  },
  {
    icon: Clock,
    title: "Timeline view",
    body: "See all your protection windows in one clear, chronological view.",
  },
];

export default function ConsumerProtectionSection() {
  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left — copy */}
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
            className="flex flex-col gap-8"
          >
            <div>
              <motion.div variants={fadeInUp}>
                <SectionLabel>Protection</SectionLabel>
              </motion.div>
              <motion.h2
                variants={fadeInUp}
                className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4"
              >
                More than
                <br />
                receipt storage.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-muted-foreground leading-relaxed">
                Receebo tracks every return window, warranty, and consumer right
                attached to your purchases — so you're always protected.
              </motion.p>
            </div>

            {/* Feature list */}
            <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-4">
              {protections.map(({ icon: Icon, title, body }) => (
                <motion.div
                  key={title}
                  variants={fadeInUp}
                  className="bg-background rounded-2xl border border-border p-5 shadow-sm flex flex-col gap-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-foreground/5 flex items-center justify-center">
                    <Icon className="w-4.5 h-4.5 text-foreground/70" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm mb-1">{title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right — placeholder */}
          <motion.div
            variants={slideInRight}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
          >
            <Placeholder
              label="Graphic Placeholder"
              className="w-full h-[420px] lg:h-[500px]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
