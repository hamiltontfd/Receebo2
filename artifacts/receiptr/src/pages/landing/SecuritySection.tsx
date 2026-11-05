import { motion } from "framer-motion";
import { Lock, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { lt } from "@/lib/landingLocale";

const getPoints = () => [
  {
    icon: Lock,
    title: lt(
      "Receipt details encrypted at rest",
      "Detalhes do recibo encriptados em repouso",
      "Detalhes do recibo criptografados em repouso",
    ),
    body: lt(
      "Summary, OCR text and product lists use AES-256-GCM. Keys stay on our servers.",
      "O resumo, o texto OCR e as listas de produtos usam AES-256-GCM. As chaves ficam nos nossos servidores.",
      "O resumo, o texto OCR e as listas de produtos usam AES-256-GCM. As chaves ficam nos nossos servidores.",
    ),
  },
  {
    icon: Shield,
    title: lt(
      "Traffic encrypted with HTTPS",
      "Tráfego encriptado com HTTPS",
      "Tráfego criptografado com HTTPS",
    ),
    body: lt(
      "Everything between your browser and Receebo travels over HTTPS.",
      "Tudo entre o seu browser e o Receebo viaja por HTTPS.",
      "Tudo entre o seu navegador e o Receebo viaja por HTTPS.",
    ),
  },
  {
    icon: ShieldCheck,
    title: lt(
      "We never sell your data",
      "Nunca vendemos os seus dados",
      "Nunca vendemos seus dados",
    ),
    body: lt(
      "No ads built from your receipts. Your purchases are not a product.",
      "Sem anúncios feitos a partir dos seus recibos. As suas compras não são um produto.",
      "Sem anúncios feitos a partir dos seus recibos. Suas compras não são um produto.",
    ),
  },
  {
    icon: Trash2,
    title: lt(
      "Delete your account anytime",
      "Apague a conta quando quiser",
      "Apague a conta quando quiser",
    ),
    body: lt(
      "When you leave, your data goes with it. Inbox links are read-only — disconnect whenever you want.",
      "Quando sair, os seus dados vão consigo. As ligações à caixa de correio são só de leitura — desligue quando quiser.",
      "Quando sair, seus dados vão junto. As conexões da caixa de entrada são só de leitura — desconecte quando quiser.",
    ),
  },
];

export default function SecuritySection() {
  const points = getPoints();

  return (
    <section id="security" className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-12"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>{lt("Security", "Segurança")}</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            {lt(
              "Your receipts, protected",
              "Os seus recibos, protegidos",
              "Seus recibos, protegidos",
            )}
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="text-base sm:text-lg text-muted-foreground leading-relaxed mt-4 max-w-2xl mx-auto"
          >
            {lt(
              "Built so your purchase history stays yours — encrypted details, private by default.",
              "Pensado para que o seu histórico de compras continue seu — detalhes encriptados, privado por omissão.",
              "Feito para que seu histórico de compras continue seu — detalhes criptografados, privado por padrão.",
            )}
          </motion.p>
        </motion.div>

        <motion.ul
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="flex flex-col gap-3 list-none m-0 p-0"
        >
          {points.map(({ icon: Icon, title, body }) => (
            <motion.li
              key={title}
              variants={fadeInUp}
              className="rounded-2xl border border-border bg-background p-5 shadow-sm flex gap-4 items-start"
            >
              <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-foreground/70" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-base mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
