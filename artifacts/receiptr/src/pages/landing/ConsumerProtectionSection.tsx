import { motion } from "framer-motion";
import { ShieldCheck, Clock, RotateCcw, Scale } from "lucide-react";
import { fadeInUp, slideInRight, stagger, VIEWPORT, SectionLabel } from "./shared";
import { AppCapture } from "./MarketingMedia";

const protections = [
  {
    icon: RotateCcw,
    title: "Return windows",
    body: "View estimated return dates where purchase details and local rules are available.",
  },
  {
    icon: ShieldCheck,
    title: "Warranty tracking",
    body: "Get reminded before your product warranties expire.",
  },
  {
    icon: Scale,
    title: "Consumer rights",
    body: "View country-specific guidance, with sources and applicable limits.",
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
                a receipts storage.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-muted-foreground leading-relaxed">
                Keep available warranty details and return information with your
                purchases. Coverage depends on the product, seller, country, and
                purchase details — always check the applicable terms.
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

          {/* Actual receipt-level consumer-rights information */}
          <motion.div
            variants={slideInRight}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
          >
            <AppCapture
              file="protection.webp"
              alt="Real Receebo consumer-rights panel for a fictional in-store TV purchase in Portugal, showing a three-year legal warranty until 23 October 2029 with its legal citation and a two-year manufacturer warranty until 23 October 2028."
              caption="Fictional Portugal example, captured 27 Oct 2026. General guidance, not a guarantee of eligibility."
              className="w-full h-[420px] lg:h-[500px]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
