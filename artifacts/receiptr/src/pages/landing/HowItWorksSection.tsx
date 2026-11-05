import { motion } from "framer-motion";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { lt } from "@/lib/landingLocale";

/** Same filled square icon real push notifications use (sw.ts → receebo-outline-192.png). */
function PushAppIcon({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/receebo-outline-192.png`}
      alt=""
      width={40}
      height={40}
      decoding="async"
      className={className}
      data-testid="how-it-works-push-icon"
    />
  );
}

function getSteps(us: boolean) {
  // /us: manufacturer warranty only in every language; Best Buy mock. Default landing: COPY.md locales.
  return [
    {
      n: 1,
      title: lt(
        "Snap or forward your receipt",
        "Fotografe ou reencaminhe o talão",
        "Fotografe ou encaminhe a nota",
      ),
      body: lt(
        "Take a photo, upload a PDF, or forward it from Outlook.",
        "Tire uma foto, carregue um PDF ou reencaminhe do Outlook.",
        "Tire uma foto, envie um PDF ou encaminhe do Outlook.",
      ),
    },
    {
      n: 2,
      title: lt("AI reads it for you", "A IA lê por si", "A IA lê por você"),
      body: us
        ? lt(
            "Store, date, price and how long your manufacturer's warranty lasts.",
            "Loja, data, preço e quanto tempo dura a garantia do fabricante.",
            "Loja, data, valor e quanto tempo dura a garantia do fabricante.",
          )
        : lt(
            "Store, date, price and how long your manufacturer's warranty lasts.",
            "Loja, data, preço, garantia legal e do fabricante.",
            "Loja, data, valor, garantia legal e do fabricante.",
          ),
    },
    {
      n: 3,
      title: lt(
        "We remind you before it's too late",
        "Avisamos antes do prazo acabar",
        "A gente avisa antes do prazo acabar",
      ),
      body: lt(
        "Get an alert before your return window closes or your warranty runs out.",
        "Receba um alerta antes de terminar o prazo de devolução ou a garantia.",
        "Receba um alerta antes de acabar o prazo de troca ou a garantia.",
      ),
      notification: us
        ? lt(
            "Best Buy · Return window closes in 3 days",
            "Best Buy · Prazo de devolução termina em 3 dias",
            "Best Buy · Prazo de troca acaba em 3 dias",
          )
        : lt(
            "Best Buy · Return window closes in 3 days",
            "Worten · Prazo de devolução termina em 3 dias",
            "Magalu · Prazo de troca acaba em 3 dias",
          ),
    },
  ] as const;
}

export default function HowItWorksSection({ variant }: { variant?: "us" } = {}) {
  const us = variant === "us";
  const steps = getSteps(us);

  return (
    <section id="how-it-works" className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-12"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>{lt("Product", "Produto")}</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            {lt("How it works", "Como funciona")}
          </motion.h2>
        </motion.div>

        <motion.ol
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="flex flex-col gap-4 list-none m-0 p-0"
        >
          {steps.map((step) => {
            const highlight = step.n === 3;
            return (
              <motion.li
                key={step.n}
                variants={fadeInUp}
                className={
                  highlight
                    ? "rounded-2xl border-2 border-[hsl(258_55%_72%)] bg-[hsl(258_85%_97%)] p-5 sm:p-6 shadow-sm"
                    : "rounded-2xl border border-border bg-background p-5 sm:p-6 shadow-sm"
                }
              >
                <div className="flex gap-4 items-start">
                  <span
                    className={
                      highlight
                        ? "shrink-0 w-9 h-9 rounded-full bg-[hsl(258_55%_55%)] text-white flex items-center justify-center text-sm font-bold"
                        : "shrink-0 w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold"
                    }
                    aria-hidden="true"
                  >
                    {step.n}
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col gap-2">
                    <h3 className="font-bold text-lg tracking-tight leading-snug">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                    {"notification" in step && step.notification ? (
                      <div
                        className="mt-2 rounded-xl bg-background border border-border shadow-sm px-3.5 py-3 flex gap-3 items-start max-w-full"
                        data-testid="how-it-works-notification"
                      >
                        <PushAppIcon className="w-10 h-10 shrink-0 rounded-[11px] shadow-sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold truncate">Receebo</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {lt("now", "agora")}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/90 leading-snug mt-0.5 break-words">
                            {step.notification}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>

        <motion.p
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center text-sm text-foreground/80 mt-10"
        >
          {lt("Free for 15 days. No credit card.", "15 dias grátis. Sem cartão.")}
        </motion.p>
      </div>
    </section>
  );
}
