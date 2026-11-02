import { Link } from "wouter";
import { motion } from "framer-motion";
import { useHydrationSafeReducedMotion } from "@/lib/useHydrationSafeReducedMotion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { fadeInUp, slideInRight, stagger } from "./shared";
import { marketingMedia } from "./MarketingMedia";
import { lt } from "@/lib/landingLocale";
import { useLandingCta } from "./useLandingCta";

export default function HeroSection({ isSignedIn = false, variant }: { isSignedIn?: boolean; variant?: "us" }) {
  const us = variant === "us";
  const onCta = useLandingCta(us ? "/us" : "/", isSignedIn);
  const reduce = useHydrationSafeReducedMotion();
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
                {lt("Receipts.", "Recibos.")}
                <br />
                <span className="text-foreground/80">{us
                  ? lt("Returns, on time.", "Devoluções a tempo.", "Devoluções no prazo.")
                  : lt("Easy to find.", "Fáceis de encontrar.")}</span>
              </h1>
            </motion.div>

            {/* Sub */}
            <motion.p
              variants={fadeInUp}
              className="text-lg text-muted-foreground leading-relaxed max-w-md"
            >
              {us ? lt(
                "Bought a TV on Black Friday? Receebo knows the return window at Best Buy, Target, Walmart, Amazon and more, in store and online, and reminds you before it closes. Warranties too.",
                "Compraste uma TV na Black Friday? O Receebo conhece o prazo de devolução da Best Buy, Target, Walmart, Amazon e outras, na loja e online, e avisa-te antes de terminar. As garantias também.",
                "Comprou uma TV na Black Friday? O Receebo conhece o prazo de devolução da Best Buy, Target, Walmart, Amazon e outras, na loja e online, e avisa você antes de terminar. As garantias também.",
              ) : lt(
                "Scan or import from Outlook. Find any purchase in seconds. Never miss a return or warranty date.",
                "Digitaliza ou importa do Outlook. Encontra qualquer compra em segundos. Nunca percas um prazo de devolução ou de garantia.",
                "Escaneie ou importe do Outlook. Encontre qualquer compra em segundos. Nunca perca um prazo de devolução ou de garantia.",
              )}
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3 pt-1">
              <Link href={isSignedIn ? "/search" : "/sign-up"} data-testid="link-hero-trial" onClick={onCta}>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    size="lg"
                    className="rounded-full h-13 px-8 text-base font-semibold gap-2 shadow-sm w-full"
                  >
                    {isSignedIn ? lt("Open Receebo", "Abrir o Receebo") : lt("Start free, no card needed", "Começa grátis, sem cartão", "Comece grátis, sem cartão")}
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
                    {lt("See it in action", "Ver em ação")}
                  </a>
                </Button>
              </motion.div>
            </motion.div>

            {/* Trial line */}
            <motion.p variants={fadeInUp} className="text-xs text-muted-foreground">
              {lt("15 days free, up to 5 receipts.", "15 dias grátis, até 5 recibos.")}
            </motion.p>
          </motion.div>

          {/* Genuine app captures, composed without inventing interface elements */}
          <motion.div
            variants={slideInRight}
            initial={entrance}
            animate="visible"
            className="relative"
          >
            {us ? <UsHeroPlaceholder /> : <figure data-testid="hero-phones" className="m-0">
              <div className="relative mx-auto flex justify-center items-start w-full max-w-[560px] pt-2 pb-8">
                <PhoneFrame
                  file="library-phone.webp"
                  testId="img-hero-library-phone"
                  alt={lt("Actual Receebo library screen on a phone, listing fictional purchases led by a €649 Casa Lumen Electrónica TV.", "Ecrã real da biblioteca do Receebo num telemóvel, com compras fictícias, a primeira uma TV Casa Lumen Electrónica de €649.", "Tela real da biblioteca do Receebo em um celular, com compras fictícias, a primeira uma TV Casa Lumen Electrónica de €649.")}
                  className="w-[46%] max-w-[260px] z-10 -mr-[8%]"
                  float={reduce ? undefined : [0, -10, 0]}
                  duration={7}
                  priority
                />
                <PhoneFrame
                  file="receipt-phone.webp"
                  testId="img-hero-receipt-phone"
                  alt={lt("Actual Receebo receipt detail screen on a phone for the fictional Casa Lumen Electrónica purchase: a €649 55-inch 4K Smart TV.", "Ecrã real de detalhe de recibo do Receebo num telemóvel para a compra fictícia na Casa Lumen Electrónica: uma Smart TV 4K de 55 polegadas por €649.", "Tela real de detalhe de recibo do Receebo em um celular para a compra fictícia na Casa Lumen Electrónica: uma Smart TV 4K de 55 polegadas por €649.")}
                  className="w-[46%] max-w-[260px] z-20 mt-[12%]"
                  float={reduce ? undefined : [0, 8, 0]}
                  duration={8}
                />
              </div>
              <figcaption className="text-[11px] text-muted-foreground text-center">
                {lt("Real Receebo screens. Fictional sample purchases and simulated extraction.", "Ecrãs reais do Receebo. Compras de exemplo fictícias e extração simulada. Demonstração em inglês.", "Telas reais do Receebo. Compras de exemplo fictícias e extração simulada. Demonstração em inglês.")}
              </figcaption>
            </figure>}
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

/**
 * PLACEHOLDER (US mode C): no approved US screenshots exist yet (the PT hero shows
 * a € receipt and EU legal warranty). Replace with Designer's US captures (a $
 * Best Buy TV receipt with its return deadline) before launch.
 */
function UsHeroPlaceholder() {
  return (
    <div
      data-testid="us-hero-placeholder"
      className="mx-auto w-full max-w-[460px] aspect-[4/3] rounded-3xl border-2 border-dashed border-amber-400 bg-amber-50 flex flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Placeholder</span>
      <span className="text-sm text-amber-900">US app screenshots go here (Designer): Best Buy TV receipt in $, return deadline, warranty 1/2/3 years.</span>
    </div>
  );
}
