import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { useCreateCheckout } from "@/hooks/useBilling";
import { fadeInUp, stagger } from "./shared";

export default function FinalCTASection() {
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();

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
            {isSignedIn ? (
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  onClick={() => checkout.mutate("yearly")}
                  disabled={checkout.isPending}
                  className="rounded-full h-14 px-10 text-base font-semibold bg-background text-foreground hover:bg-background/90 gap-2 shadow-lg"
                >
                  {checkout.isPending ? "Loading…" : "Start your 7-day free trial"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            ) : (
              <Link href="/sign-up?plan=yearly">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="lg"
                    className="rounded-full h-14 px-10 text-base font-semibold bg-background text-foreground hover:bg-background/90 gap-2 shadow-lg"
                  >
                    Start your 7-day free trial
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </motion.div>
              </Link>
            )}
          </motion.div>

          <motion.p variants={fadeInUp} className="text-sm text-background/40">
            7-day free trial · Cancel any time · No hidden fees
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
