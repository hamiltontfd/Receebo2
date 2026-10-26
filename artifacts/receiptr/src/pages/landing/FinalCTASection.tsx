import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { fadeInUp, stagger } from "./shared";

export default function FinalCTASection() {
  const { isSignedIn } = useAuth();

  return (
    <section className="py-28 lg:py-36 bg-foreground text-background overflow-hidden relative">
      {/* Subtle radial highlight */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(220 60% 80%) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="flex flex-col items-center gap-8"
        >
          <motion.div variants={fadeInUp} className="space-y-4">
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[0.93] text-background">
              Never lose a receipt
              <br />
              again.
            </h2>
            <p className="text-xl text-background/60 font-medium">
              Receipts. Easy to find.
            </p>
          </motion.div>

          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3">
            <Link href={isSignedIn ? "/search" : "/sign-up"} data-testid="link-final-trial">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  className="rounded-full h-14 px-10 text-base font-semibold bg-background text-foreground hover:bg-background/90 gap-2 shadow-lg"
                >
                  {isSignedIn ? "Open Receebo" : "Start free, no card needed"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            </Link>
          </motion.div>

          <motion.p variants={fadeInUp} className="text-sm text-background/40">
            15 days free · Up to 5 receipts · No card needed
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
