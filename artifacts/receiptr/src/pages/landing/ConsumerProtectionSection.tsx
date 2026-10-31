import { motion } from "framer-motion";
import { ShieldCheck, Clock, RotateCcw, Scale } from "lucide-react";
import { fadeInUp, slideInRight, stagger, VIEWPORT, SectionLabel } from "./shared";
import { AppCapture } from "./MarketingMedia";
import { lt } from "@/lib/landingLocale";

const getProtections = () => [
  {
    icon: RotateCcw,
    title: lt("Return windows", "Prazos de devolução"),
    body: lt("View estimated return dates where purchase details and local rules are available.", "Consulta datas de devolução estimadas quando há detalhes da compra e regras locais disponíveis.", "Veja datas de devolução estimadas quando há detalhes da compra e regras locais disponíveis."),
  },
  {
    icon: ShieldCheck,
    title: lt("Warranty tracking", "Acompanhamento de garantias"),
    body: lt("Get reminded before your product warranties expire.", "Recebe lembretes antes de as garantias dos teus produtos expirarem.", "Receba lembretes antes que as garantias dos seus produtos expirem."),
  },
  {
    icon: Scale,
    title: lt("Consumer rights", "Direitos do consumidor"),
    body: lt("View country-specific guidance, with sources and applicable limits.", "Consulta orientações específicas de cada país, com fontes e limites aplicáveis.", "Veja orientações específicas de cada país, com fontes e limites aplicáveis."),
  },
  {
    icon: Clock,
    title: lt("Timeline view", "Cronologia"),
    body: lt("See all your protection windows in one clear, chronological view.", "Vê todos os teus prazos de proteção numa vista cronológica clara.", "Veja todos os seus prazos de proteção em uma visão cronológica clara."),
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
                <SectionLabel>{lt("Protection", "Proteção")}</SectionLabel>
              </motion.div>
              <motion.h2
                variants={fadeInUp}
                className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4"
              >
                {lt("More than", "Mais do que")}
                <br />
                {lt("a receipts storage.", "um arquivo de recibos.")}
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-muted-foreground leading-relaxed">
                {lt(
                  "Keep available warranty details and return information with your purchases. Coverage depends on the product, seller, country, and purchase details — always check the applicable terms.",
                  "Guarda com as tuas compras os detalhes disponíveis de garantia e devolução. A cobertura depende do produto, do vendedor, do país e dos detalhes da compra — confirma sempre as condições aplicáveis.",
                  "Guarde com suas compras os detalhes disponíveis de garantia e devolução. A cobertura depende do produto, do vendedor, do país e dos detalhes da compra — sempre confira as condições aplicáveis.",
                )}
              </motion.p>
            </div>

            {/* Feature list */}
            <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-4">
              {getProtections().map(({ icon: Icon, title, body }) => (
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
              alt={lt("Real Receebo consumer-rights panel for a fictional in-store TV purchase in Portugal, showing a three-year legal warranty until 23 October 2029 with its legal citation and a two-year manufacturer warranty until 23 October 2028.", "Painel real de direitos do consumidor do Receebo para uma compra fictícia de uma TV em loja em Portugal, com garantia legal de três anos até 23 de outubro de 2029, a respetiva referência legal, e garantia do fabricante de dois anos até 23 de outubro de 2028.", "Painel real de direitos do consumidor do Receebo para uma compra fictícia de uma TV em loja em Portugal, com garantia legal de três anos até 23 de outubro de 2029, a respectiva referência legal, e garantia do fabricante de dois anos até 23 de outubro de 2028.")}
              caption={lt("Fictional Portugal example, captured 27 Oct 2026. General guidance, not a guarantee of eligibility.", "Exemplo fictício de Portugal, ecrã em inglês captado a 27 out 2026. Orientação geral, não garante elegibilidade.", "Exemplo fictício de Portugal, tela em inglês capturada em 27 out 2026. Orientação geral, não garante elegibilidade.")}
              className="w-full h-[420px] lg:h-[500px]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
