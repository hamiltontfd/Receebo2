import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { AppCapture } from "./MarketingMedia";
import { lt } from "@/lib/landingLocale";

const getFeatures = () => [
  {
    title: lt("Capture", "Capturar"),
    items: [
      lt("Scan paper receipts", "Digitaliza recibos em papel", "Escaneie recibos em papel"),
      lt("Upload PDF, JPG or PNG", "Carrega PDF, JPG ou PNG", "Envie PDF, JPG ou PNG"),
      lt("Import receipts from your inbox", "Importa recibos do teu email", "Importe recibos do seu e-mail"),
    ],
    image: "capture-poster.webp",
    alt: lt("Receebo's real review form displaying Casa Lumen Electrónica, 23 October 2026 and a €649 total from a fictional receipt.", "Formulário real de revisão do Receebo com Casa Lumen Electrónica, 23 de outubro de 2026 e um total de €649 de um recibo fictício."),
  },
  {
    title: lt("Find", "Encontrar"),
    items: [
      lt("Search by product", "Pesquisa por produto", "Pesquise por produto"),
      lt("Search by merchant", "Pesquisa por loja", "Pesquise por loja"),
      lt("Search by brand or category", "Pesquisa por marca ou categoria", "Pesquise por marca ou categoria"),
    ],
    image: "find-poster.webp",
    alt: lt("A search for TV in the real Receebo interface finds the fictional Casa Lumen Electrónica purchase.", "Uma pesquisa por TV na interface real do Receebo encontra a compra fictícia na Casa Lumen Electrónica."),
  },
  {
    title: lt("Protect", "Proteger"),
    items: [
      lt("Warranty reminders", "Lembretes de garantia"),
      lt("Return window alerts", "Alertas de prazo de devolução"),
      lt("Consumer rights info", "Informação sobre direitos do consumidor", "Informações sobre direitos do consumidor"),
    ],
    image: "protection.webp",
    alt: lt("Actual consumer-rights information for the sample Portugal purchase: the 3-year legal warranty and the 2-year manufacturer warranty, each with its own end date.", "Informação real sobre direitos do consumidor para a compra de exemplo em Portugal: a garantia legal de 3 anos e a garantia do fabricante de 2 anos, cada uma com a sua data de fim."),
  },
  {
    title: lt("Prove", "Comprovar"),
    items: [
      lt("Fullscreen receipt view", "Recibo em ecrã inteiro", "Recibo em tela cheia"),
      lt("Download as PDF", "Descarregar em PDF", "Baixar em PDF"),
      lt("Share proof of purchase", "Partilhar comprovativo de compra", "Compartilhar comprovante de compra"),
    ],
    image: "show-to-store.webp",
    alt: lt("Receebo's full-screen Show to store view displaying the fictional Casa Lumen Electrónica receipt for a €649 55-inch 4K Smart TV.", "Vista de ecrã inteiro do Receebo para mostrar na loja, com o recibo fictício da Casa Lumen Electrónica de uma Smart TV 4K de 55 polegadas por €649.", "Visualização em tela cheia do Receebo para mostrar na loja, com o recibo fictício da Casa Lumen Electrónica de uma Smart TV 4K de 55 polegadas por €649."),
  },
];

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 1, 1] as const },
  }),
};

export default function WhyReceeboSection() {
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);

  const goTo = (idx: number) => {
    setDir(idx > active ? 1 : -1);
    setActive(idx);
  };

  const FEATURES = getFeatures();
  const feature = FEATURES[active];

  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="mb-12"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>{lt("Why Receebo", "Porquê o Receebo", "Por que o Receebo")}</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight max-w-2xl"
          >
            {lt("Forgot where or when?", "Esqueceste onde ou quando?", "Esqueceu onde ou quando?")}
            <br />
            {lt("We got you.", "Nós ajudamos.")}
          </motion.h2>
        </motion.div>

        {/* Slideshow card */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="bg-background border border-border rounded-3xl overflow-hidden shadow-sm"
        >
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {FEATURES.map((f, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-pressed={i === active}
                className="relative flex-1 py-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-foreground focus-visible:-outline-offset-4"
                style={{
                  color: i === active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                {f.title}
                {/* Manual tabs keep detailed screenshots readable without auto-advance. */}
                {i === active && (
                  <span
                    className="absolute bottom-0 left-0 h-0.5 bg-foreground rounded-full"
                    style={{ width: "100%" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Slide content */}
          <div className="grid md:grid-cols-2 min-h-[420px]">
            {/* Left — content */}
            <div className="flex items-center p-8 md:p-12 border-b md:border-b-0">
              <AnimatePresence custom={dir} mode="wait">
                <motion.div
                  key={active + "-text"}
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-6 w-full"
                >
                  <h3 className="text-3xl font-extrabold tracking-tight">
                    {feature.title}
                  </h3>
                  <ul className="space-y-4">
                    {feature.items.map((item, i) => (
                      <motion.li
                        key={item}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 + 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center gap-3 text-base text-muted-foreground"
                      >
                        <span className="w-6 h-6 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-[12px] font-bold text-foreground/40">
                          ✓
                        </span>
                        {item}
                      </motion.li>
                    ))}
                  </ul>

                  {/* Dot nav */}
                  <div className="flex gap-2 pt-2">
                    {FEATURES.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goTo(i)}
                        className="h-1.5 rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-4"
                        style={{
                          width: i === active ? "24px" : "6px",
                          backgroundColor:
                            i === active
                              ? "hsl(var(--foreground))"
                              : "hsl(var(--foreground) / 0.15)",
                        }}
                        aria-label={`${lt("Go to", "Ir para")} ${FEATURES[i].title}`}
                      />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right — image */}
            <div className="relative overflow-hidden min-h-[280px] lg:min-h-[420px]">
              <AnimatePresence custom={dir} mode="wait">
                <motion.div
                  key={active + "-img"}
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="absolute inset-0 p-6 flex items-center justify-center"
                >
                  <AppCapture
                    file={feature.image}
                    alt={feature.alt}
                    className="w-full h-full"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
