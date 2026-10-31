import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { cn } from "@/lib/utils";
import { lt } from "@/lib/landingLocale";

const getRows = () => [
  lt("Search by product", "Pesquisa por produto"),
  lt("Warranty tracking", "Acompanhamento de garantias"),
  lt("Return window alerts", "Alertas de prazo de devolução"),
  lt("Consumer rights info", "Informação sobre direitos do consumidor", "Informações sobre direitos do consumidor"),
  lt("AI extraction", "Extração com IA"),
  lt("Fullscreen proof of purchase", "Comprovativo de compra em ecrã inteiro", "Comprovante de compra em tela cheia"),
];

const getColumns = () => [
  { key: "photos", label: lt("Photos", "Fotos"), values: [false, false, false, false, false, false] },
  { key: "email", label: lt("Email", "Email", "E-mail"), values: [false, false, false, false, false, false] },
  { key: "receebo", label: "Receebo", values: [true, true, true, true, true, true], highlight: true },
];

function CheckIcon({ value, highlight }: { value: boolean; highlight?: boolean }) {
  if (value) {
    return (
      <div
        className={cn(
          "mx-auto w-6 h-6 rounded-full flex items-center justify-center",
          highlight ? "bg-white/20" : "bg-foreground/5",
        )}
      >
        <Check
          className={cn("w-3.5 h-3.5", highlight ? "text-white" : "text-foreground/70")}
          strokeWidth={2.5}
        />
      </div>
    );
  }
  return (
    <div className="mx-auto w-6 h-6 rounded-full flex items-center justify-center bg-muted/40">
      <X className="w-3.5 h-3.5 text-muted-foreground/50" strokeWidth={2.5} />
    </div>
  );
}

export default function ComparisonSection() {
  const rows = getRows();
  const columns = getColumns();
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-12"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>{lt("Comparison", "Comparação")}</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            {lt("Why not just save photos?", "Porque não guardar só fotos?", "Por que não salvar só fotos?")}
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground mt-3 text-lg max-w-lg mx-auto">
            {lt("Photos and email threads lose the details that matter most.", "Fotos e conversas de email perdem os detalhes que mais importam.", "Fotos e conversas de e-mail perdem os detalhes que mais importam.")}
          </motion.p>
        </motion.div>

        {/* Table */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="rounded-2xl border border-border overflow-hidden shadow-sm"
        >
          {/* Column headers */}
          <div className="grid grid-cols-4 border-b border-border">
            <div className="col-span-1 px-5 py-4 bg-muted/20" />
            {columns.map(({ label, highlight }) => (
              <div
                key={label}
                className={cn(
                  "col-span-1 px-4 py-4 text-center font-bold text-sm border-l border-border",
                  highlight ? "bg-foreground text-background" : "bg-muted/20",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div
              key={row}
              className={cn(
                "grid grid-cols-4 border-b border-border last:border-b-0",
                i % 2 === 0 ? "bg-background" : "bg-muted/10",
              )}
            >
              <div className="col-span-1 px-5 py-4 text-sm font-medium text-foreground/80 flex items-center">
                {row}
              </div>
              {columns.map(({ label, values, highlight }) => (
                <div
                  key={label}
                  className={cn(
                    "col-span-1 px-4 py-4 flex items-center justify-center border-l border-border",
                    highlight && (i % 2 === 0 ? "bg-foreground/[0.97]" : "bg-foreground/[0.93]"),
                  )}
                >
                  <CheckIcon value={values[i]} highlight={highlight} />
                </div>
              ))}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
