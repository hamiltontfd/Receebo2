import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/react";
import { ArrowRight, Play } from "lucide-react";
import { fadeInUp, slideInRight, stagger } from "./shared";
import { marketingMedia } from "./MarketingMedia";

export default function HeroSection() {
  const { isSignedIn } = useAuth();
  const reduce = useReducedMotion();
  const entrance = reduce ? false : "hidden";

  return (
    <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
      {/* Subtle radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 70% at 78% 40%, hsl(258 85% 95%) 0%, transparent 70%), radial-gradient(ellipse 80% 60% at 55% -10%, hsl(220 100% 96%) 0%, transparent 70%), linear-gradient(180deg, hsl(220 60% 98.5%) 0%, hsl(var(--background)) 100%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — Copy */}
          <motion.div
            variants={stagger}
            initial={entrance}
            animate="visible"
            className="flex flex-col gap-7 max-w-xl"
          >
            {/* Headline */}
            <motion.div variants={fadeInUp} className="space-y-1">
              <h1 className="text-6xl sm:text-7xl lg:text-[80px] font-extrabold tracking-tighter leading-[0.93] text-foreground">
                Receipts.
                <br />
                <span className="text-foreground/80">Easy to find.</span>
              </h1>
            </motion.div>

            {/* Sub */}
            <motion.p
              variants={fadeInUp}
              className="text-lg text-muted-foreground leading-relaxed max-w-md"
            >
              Scan or import from Outlook. Find any purchase in seconds. Never miss a return or
              warranty date.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3 pt-1">
              <Link href={isSignedIn ? "/search" : "/sign-up"} data-testid="link-hero-trial">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    size="lg"
                    className="rounded-full h-13 px-8 text-base font-semibold gap-2 shadow-sm w-full"
                  >
                    {isSignedIn ? "Open Receebo" : "Start free, no card needed"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </motion.div>
              </Link>

              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="rounded-full h-13 px-8 text-base font-medium gap-2 w-full sm:w-auto"
                >
                  <a href="#demo">
                    <Play className="w-3.5 h-3.5 fill-current" />
                    See it in action
                  </a>
                </Button>
              </motion.div>
            </motion.div>

            {/* Trial line */}
            <motion.p variants={fadeInUp} className="text-xs text-muted-foreground">
              15 days free, up to 5 receipts.
            </motion.p>
          </motion.div>

          {/* Genuine app captures, composed without inventing interface elements */}
          <motion.div
            variants={slideInRight}
            initial={entrance}
            animate="visible"
            className="relative"
          >
            <figure data-testid="hero-phones" className="m-0">
              <div className="relative mx-auto flex justify-center items-start w-full max-w-[560px] pt-2 pb-8">
                <PhoneFrame
                  file="library-phone.webp"
                  testId="img-hero-library-phone"
                  alt="Actual Receebo library screen on a phone, listing a fictional Northline Audio purchase."
                  className="w-[46%] max-w-[260px] z-10 -mr-[8%]"
                  float={reduce ? undefined : [0, -10, 0]}
                  duration={7}
                  priority
                />
                <PhoneFrame
                  file="receipt-phone.webp"
                  testId="img-hero-receipt-phone"
                  alt="Actual Receebo receipt detail screen on a phone for the fictional Northline Audio purchase: €169 headphones and a €20 travel case."
                  className="w-[46%] max-w-[260px] z-20 mt-[12%]"
                  float={reduce ? undefined : [0, 8, 0]}
                  duration={8}
                />
              </div>
              <figcaption className="text-[11px] text-muted-foreground text-center">
                Real Receebo screens. Fictional sample purchases and simulated extraction.
              </figcaption>
            </figure>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function PhoneFrame({
  file, alt, className, float, duration, priority, testId,
}: {
  file: string;
  alt: string;
  className?: string;
  float?: number[];
  duration: number;
  priority?: boolean;
  testId: string;
}) {
  return (
    <motion.div
      className={`relative shrink-0 ${className ?? ""}`}
      animate={float ? { y: float } : undefined}
      transition={float ? { duration, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      <div className="rounded-[2.4rem] bg-[hsl(230_18%_16%)] p-[6px] shadow-[0_30px_60px_-20px_hsl(250_40%_25%/0.35)] ring-1 ring-black/5">
        <div className={`relative overflow-hidden rounded-[2rem] pt-5 ${file === "receipt-phone.webp" ? "bg-[#333333]" : "bg-background"}`}>
          <div className="overflow-hidden">
          <img
            data-testid={testId}
            src={marketingMedia(file)}
            alt={alt}
            width={780}
            height={1688}
            decoding="async"
            {...(priority ? { fetchPriority: "high" as const } : { loading: "eager" as const })}
            className="block w-full h-auto"
            // Crop the capture-only 32px disclosure strip from the 390px-wide
            // source viewport. Keep the disclosure in the figure caption instead.
            style={{ marginTop: `${-(32 / 390) * 100}%` }}
          />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
