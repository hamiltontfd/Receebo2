import { motion } from "framer-motion";
import { RotateCcw, ShieldCheck, Store, BellRing } from "lucide-react";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";
import { lt } from "@/lib/landingLocale";

/** /us only: what Receebo does for US purchases (replaces the EU consumer-rights section). */
const getPoints = () => [
  {
    icon: Store,
    title: lt("Store return windows", "Prazos de devolução das lojas", "Prazos de devolução das lojas"),
    body: lt(
      "Amazon, Walmart, Target, Best Buy, Costco, The Home Depot and Apple: we know each store's published window, online and in store, including the shorter ones for electronics.",
      "Amazon, Walmart, Target, Best Buy, Costco, The Home Depot e Apple: conhecemos o prazo publicado de cada loja, online e na loja, incluindo os mais curtos para eletrónica.",
      "Amazon, Walmart, Target, Best Buy, Costco, The Home Depot e Apple: conhecemos o prazo publicado de cada loja, online e na loja, incluindo os mais curtos para eletrônicos.",
    ),
  },
  {
    icon: RotateCcw,
    title: lt("Any other store", "Qualquer outra loja", "Qualquer outra loja"),
    body: lt(
      "Type the window from the receipt (say, 30 days) and we count it for you. We never guess a window we don't know.",
      "Escreve o prazo que está no recibo (por exemplo, 30 dias) e nós contamos por ti. Nunca adivinhamos um prazo que não conhecemos.",
      "Digite o prazo que está no recibo (por exemplo, 30 dias) e nós contamos para você. Nunca adivinhamos um prazo que não conhecemos.",
    ),
  },
  {
    icon: ShieldCheck,
    title: lt("Manufacturer warranty", "Garantia do fabricante", "Garantia do fabricante"),
    body: lt(
      "Tap 1, 2 or 3 years and see the end date straight away.",
      "Toca em 1, 2 ou 3 anos e vê logo a data de fim.",
      "Toque em 1, 2 ou 3 anos e veja na hora a data de fim.",
    ),
  },
  {
    icon: BellRing,
    title: lt("Reminders before it's too late", "Lembretes antes de ser tarde", "Lembretes antes que seja tarde"),
    body: lt(
      "By email and push, a few days before a return window or warranty ends.",
      "Por email e notificação, alguns dias antes de terminar um prazo de devolução ou uma garantia.",
      "Por e-mail e notificação, alguns dias antes de terminar um prazo de devolução ou uma garantia.",
    ),
  },
];

export default function UsReturnsSection() {
  return (
    <section className="py-24 lg:py-32 bg-muted/20" data-testid="section-us-returns">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={VIEWPORT} className="space-y-10">
          <motion.div variants={fadeInUp} className="space-y-3 max-w-2xl">
            <SectionLabel>{lt("Returns & warranties", "Devoluções e garantias", "Devoluções e garantias")}</SectionLabel>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {lt("Know the last day to return it.", "Sabe qual é o último dia para devolver.", "Saiba qual é o último dia para devolver.")}
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-6">
            {getPoints().map(({ icon: Icon, title, body }) => (
              <motion.div key={title} variants={fadeInUp} className="rounded-2xl border bg-background p-6 space-y-2">
                <Icon className="w-5 h-5 text-primary" aria-hidden />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </motion.div>
            ))}
          </div>
          <motion.p variants={fadeInUp} className="text-xs text-muted-foreground max-w-2xl">
            {lt(
              "Store policies change and can differ by item or membership. Receebo shows each store's published policy with its source; the store's own terms decide. General information, not legal advice.",
              "As políticas das lojas mudam e podem variar por artigo ou adesão. O Receebo mostra a política publicada de cada loja com a fonte; prevalecem os termos da própria loja. Informação geral, não aconselhamento jurídico.",
              "As políticas das lojas mudam e podem variar por item ou assinatura. O Receebo mostra a política publicada de cada loja com a fonte; valem os termos da própria loja. Informação geral, não aconselhamento jurídico.",
            )}
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
