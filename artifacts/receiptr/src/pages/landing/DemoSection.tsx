import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Play } from "lucide-react";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { marketingMedia } from "./MarketingMedia";
import DemoVideoModal from "./DemoVideoModal";
import { lt } from "@/lib/landingLocale";

const getDemos = () => [
  {
    title: lt("Capture", "Capturar"),
    body: lt("Scan, upload or import receipts in seconds.", "Digitaliza, carrega ou importa recibos em segundos.", "Escaneie, envie ou importe recibos em segundos."),
    clip: "capture",
    description: lt(
      "A sample receipt image is selected, its extracted merchant, date and €649 total are reviewed, and the purchase is saved. Extraction responses are simulated for this recording.",
      "É escolhida a imagem de um recibo de exemplo, o comerciante, a data e o total de €649 extraídos são revistos e a compra é guardada. As respostas da extração são simuladas nesta gravação.",
      "É escolhida a imagem de um recibo de exemplo, a loja, a data e o total de €649 extraídos são revisados e a compra é salva. As respostas da extração são simuladas nesta gravação.",
    ),
  },
  {
    title: lt("Find", "Encontrar"),
    body: lt("Search products, stores or brands and instantly find the receipt you need.", "Pesquisa produtos, lojas ou marcas e encontra logo o recibo de que precisas.", "Pesquise produtos, lojas ou marcas e encontre na hora o recibo de que precisa."),
    clip: "find",
    description: lt(
      "Typing “TV” filters the sample library to Casa Lumen Electrónica. Opening the result shows the purchased item and the original receipt.",
      "Escrever “TV” filtra a biblioteca de exemplo para a Casa Lumen Electrónica. Abrir o resultado mostra o artigo comprado e o recibo original.",
      "Digitar “TV” filtra a biblioteca de exemplo para a Casa Lumen Electrónica. Abrir o resultado mostra o item comprado e o recibo original.",
    ),
  },
  {
    title: lt("Protect", "Proteger"),
    body: lt("View available warranty and return information.", "Consulta a informação disponível sobre garantias e devoluções.", "Veja as informações disponíveis sobre garantias e devoluções."),
    clip: "protect",
    description: lt(
      "The sample in-store TV purchase shows the Portugal 3-year legal warranty and the 2-year manufacturer warranty side by side, each with its own end date. Dates depend on purchase details; eligibility and exclusions must be checked with the seller.",
      "A compra de exemplo de uma TV em loja mostra lado a lado a garantia legal de 3 anos em Portugal e a garantia do fabricante de 2 anos, cada uma com a sua data de fim. As datas dependem dos detalhes da compra; a elegibilidade e as exclusões devem ser confirmadas com o vendedor.",
      "A compra de exemplo de uma TV em loja mostra lado a lado a garantia legal de 3 anos em Portugal e a garantia do fabricante de 2 anos, cada uma com sua data de término. As datas dependem dos detalhes da compra; a elegibilidade e as exclusões devem ser confirmadas com o vendedor.",
    ),
  },
];

export default function DemoSection() {
  const [activeDemo, setActiveDemo] = useState<ReturnType<typeof getDemos>[number] | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const reduce = useReducedMotion();
  const demos = getDemos();
  const showDemo = (demo: (typeof demos)[number]) => {
    setActiveDemo(demo);
    setVideoOpen(true);
  };

  return (
    <section id="demo" className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-16"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>{lt("In action", "Em ação")}</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            {lt("See Receebo in action", "Vê o Receebo em ação", "Veja o Receebo em ação")}
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-sm text-muted-foreground mt-4 max-w-2xl mx-auto">
            {lt(
              "Real app recordings with fictional sample data and simulated extraction. No live email connection is shown.",
              "Gravações reais da app, em inglês, com dados de exemplo fictícios e extração simulada. Não é mostrada nenhuma ligação real a email.",
              "Gravações reais do app, em inglês, com dados de exemplo fictícios e extração simulada. Nenhuma conexão real de e-mail é mostrada.",
            )}
          </motion.p>
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="grid md:grid-cols-3 gap-6"
        >
          {demos.map((demo) => {
            const { title, body, clip, description } = demo;
            return (
            <motion.div
              key={clip}
              variants={fadeInUp}
              whileHover={reduce ? undefined : { y: -4, transition: { duration: 0.2 } }}
              className="bg-background rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
            >
              <button
                type="button"
                data-demo={clip}
                onClick={() => showDemo(demo)}
                aria-label={lt(`Play ${title} demo`, `Reproduzir demonstração: ${title}`)}
                aria-haspopup="dialog"
                className="group relative block w-full aspect-video overflow-hidden bg-muted/20 border-b border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
              >
                <img
                  src={marketingMedia(`${clip}-poster.webp`)}
                  alt=""
                  width={960}
                  height={640}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg motion-safe:transition-transform motion-safe:group-hover:scale-110">
                    <Play className="h-5 w-5 ml-0.5 fill-current text-foreground" aria-hidden="true" />
                  </span>
                </span>
              </button>

              {/* Text */}
              <div className="p-6 flex flex-col gap-2">
                <h3 className="font-bold text-lg tracking-tight">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                <details className="text-xs text-muted-foreground mt-2">
                  <summary className="cursor-pointer font-medium text-foreground">{lt("What this demo shows", "O que esta demonstração mostra")}</summary>
                  <p id={`${clip}-description`} className="mt-2 leading-relaxed">{description}</p>
                  <button type="button" onClick={() => showDemo(demo)} className="inline-block mt-2 underline">
                    {lt(`Watch ${title.toLowerCase()} video`, `Ver vídeo: ${title.toLowerCase()}`)}
                  </button>
                </details>
              </div>
            </motion.div>
            );
          })}
        </motion.div>
      </div>
      <DemoVideoModal demo={activeDemo} open={videoOpen} onOpenChange={setVideoOpen} />
    </section>
  );
}
