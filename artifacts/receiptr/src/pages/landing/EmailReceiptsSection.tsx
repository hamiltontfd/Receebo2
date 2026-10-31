import { motion } from "framer-motion";
import { Mail, Upload, Camera, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  fadeInUp, slideInLeft, stagger, VIEWPORT, SectionLabel,
  lProviderNames, lInboxPhrase, lAccountsNote, lOutlookOnlyTitle, lOutlookOnlyBody,
} from "./shared";
import { isOutlookOnly, useAvailableMailProviders } from "@/lib/availableMailProviders";
import { lt } from "@/lib/landingLocale";

export default function EmailReceiptsSection() {
  // Provider names come from the same flag that controls Settings
  // (MAIL_PROVIDERS_ENABLED), so nothing here is hard-coded to one inbox.
  const providers = useAvailableMailProviders();
  const names = lProviderNames(providers);
  const accountsNote = lAccountsNote(providers);
  const outlookOnly = isOutlookOnly(providers);

  const methods = [
    { icon: Mail, label: names ? lt(`Connect ${names}`, `Ligar ${names}`, `Conectar ${names}`) : lt("Connect your inbox", "Ligar o teu email", "Conectar seu e-mail") },
    { icon: Upload, label: lt("Upload from files", "Carregar ficheiros", "Enviar arquivos") },
    { icon: Camera, label: lt("Scan with camera", "Digitalizar com a câmara", "Escanear com a câmera") },
  ];

  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Illustration of inbox import (not a screenshot) */}
          <motion.div
            variants={slideInLeft}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
            className="order-2 lg:order-1"
          >
            <figure
              data-testid="email-import-illustration"
              className="rounded-2xl border border-border bg-gradient-to-br from-blue-50/70 to-violet-50/70 p-6 sm:p-8 flex min-w-0 flex-col justify-center gap-5"
            >
              <div className="rounded-xl border border-border/60 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {lt("Email import", "Importação de email", "Importação de e-mail")}
                </p>
                <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border/70 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Mail className="h-4 w-4 text-foreground/70" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{names ?? lt("Your inbox", "O teu email", "Seu e-mail")}</p>
                      <p className="truncate text-xs text-muted-foreground">{lt("Read-only access", "Acesso só de leitura", "Acesso somente leitura")}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
                    {lt("Connect", "Ligar", "Conectar")}
                  </span>
                </div>
                <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {lt("Finds order emails and PDF receipts from the last 90 days", "Encontra emails de encomendas e recibos em PDF dos últimos 90 dias", "Encontra e-mails de pedidos e recibos em PDF dos últimos 90 dias")}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {lt("You review every import before it is saved", "Revês cada importação antes de ser guardada", "Você revisa cada importação antes de ser salva")}
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    {lt("Never sends, edits or deletes your email", "Nunca envia, edita nem apaga os teus emails", "Nunca envia, edita nem apaga seus e-mails")}
                  </li>
                </ul>
              </div>
              <figcaption className="text-center text-[11px] text-muted-foreground leading-relaxed">
                {lt("Illustration · disconnect any time in Settings", "Ilustração · desliga quando quiseres nas Definições", "Ilustração · desconecte quando quiser nas Configurações")}
              </figcaption>
            </figure>
          </motion.div>

          {/* Right — copy */}
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
            className="flex flex-col gap-7 order-1 lg:order-2"
          >
            <div>
              <motion.div variants={fadeInUp}>
                <SectionLabel>{lt("Email receipts", "Recibos por email", "Recibos por e-mail")}</SectionLabel>
              </motion.div>
              <motion.h2
                variants={fadeInUp}
                className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4"
              >
                {outlookOnly ? (
                  lOutlookOnlyTitle()
                ) : (
                  <>
                    {lt("Not every receipt", "Nem todos os recibos")}
                    <br />
                    {lt("is on paper.", "são em papel.")}
                  </>
                )}
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-muted-foreground leading-relaxed" data-testid="text-email-section-body">
                {outlookOnly ? (
                  lOutlookOnlyBody()
                ) : (
                  <>
                    {lt(
                      `Connect ${lInboxPhrase(providers)} and Receebo finds your online order confirmations and PDF receipts, so proof of purchase is there when you need a return or a warranty claim.`,
                      `Liga ${lInboxPhrase(providers)} e o Receebo encontra as confirmações de encomendas online e os recibos em PDF, para teres o comprovativo de compra quando precisares de uma devolução ou de acionar a garantia.`,
                      `Conecte ${lInboxPhrase(providers)} e o Receebo encontra as confirmações de pedidos online e os recibos em PDF, para você ter o comprovante de compra quando precisar de uma devolução ou de acionar a garantia.`,
                    )}
                    {accountsNote ? ` ${accountsNote}` : ""}
                  </>
                )}
              </motion.p>
            </div>

            {/* Method pills */}
            <motion.div variants={stagger} className="flex flex-col gap-3">
              {methods.map(({ icon: Icon, label }) => (
                <motion.div
                  key={label}
                  variants={fadeInUp}
                  className="flex items-center gap-3.5 bg-muted/30 rounded-xl px-4 py-3.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm shrink-0">
                    <Icon className="w-4 h-4 text-foreground/70" />
                  </div>
                  <span className="text-sm font-semibold">{label}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
