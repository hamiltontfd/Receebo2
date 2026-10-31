import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { fadeInUp, stagger, VIEWPORT, SectionLabel, lInboxPhrase, lAccountsNote, lOutlookOnlyFaq } from "./shared";
import {
  useAvailableMailProviders,
  isOutlookOnly,
  type AvailableMailProvider,
} from "@/lib/availableMailProviders";
import { lt } from "@/lib/landingLocale";

function buildFaqs(providers: AvailableMailProvider[]) {
  const inbox = lInboxPhrase(providers);
  const accountsNote = lAccountsNote(providers);
  return [
  {
    q: lt("How does Receebo work?", "Como funciona o Receebo?"),
    a: lt(
      `Scan any paper receipt with your phone camera, upload a PDF or image, or connect ${inbox}. Our AI reads and indexes every detail — merchant, products, prices, warranties — in under 10 seconds. Everything becomes searchable in plain English.`,
      `Digitaliza qualquer recibo em papel com a câmara do telemóvel, carrega um PDF ou imagem, ou liga ${inbox}. A nossa IA lê e indexa cada detalhe — loja, produtos, preços, garantias — em menos de 10 segundos. Tudo fica pesquisável em linguagem simples.`,
      `Escaneie qualquer recibo em papel com a câmera do celular, envie um PDF ou imagem, ou conecte ${inbox}. Nossa IA lê e indexa cada detalhe — loja, produtos, preços, garantias — em menos de 10 segundos. Tudo fica pesquisável em linguagem simples.`,
    ),
  },
  {
    q: lt("Can I upload PDFs?", "Posso carregar PDFs?", "Posso enviar PDFs?"),
    a: lt(
      "Yes. Receebo supports PDF, JPG, and PNG files. Simply upload from your device and the AI extracts all the relevant information automatically.",
      "Sim. O Receebo aceita ficheiros PDF, JPG e PNG. Basta carregares a partir do teu dispositivo e a IA extrai automaticamente toda a informação relevante.",
      "Sim. O Receebo aceita arquivos PDF, JPG e PNG. Basta enviar do seu dispositivo e a IA extrai automaticamente todas as informações relevantes.",
    ),
  },
  {
    q: lt("Can I import email receipts?", "Posso importar recibos do email?", "Posso importar recibos do e-mail?"),
    a: lt(
      `Yes. Connect ${inbox} and Receebo looks for order confirmations and PDF receipts from the last 90 days. Access is read-only, you review each import before it is saved, and you can disconnect at any time.`,
      `Sim. Liga ${inbox} e o Receebo procura confirmações de encomendas e recibos em PDF dos últimos 90 dias. O acesso é só de leitura, revês cada importação antes de ser guardada e podes desligar quando quiseres.`,
      `Sim. Conecte ${inbox} e o Receebo procura confirmações de pedidos e recibos em PDF dos últimos 90 dias. O acesso é somente leitura, você revisa cada importação antes de ser salva e pode desconectar quando quiser.`,
    ) + (accountsNote ? ` ${accountsNote}` : ""),
  },
  ...(isOutlookOnly(providers) ? [lOutlookOnlyFaq()] : []),
  {
    q: lt("Is my data private?", "Os meus dados são privados?", "Meus dados são privados?"),
    a: lt(
      "Your receipts are private to your account and are shared only with the services needed to run Receebo, such as AI extraction. Inbox access is read-only and can be disconnected at any time. We never sell your data or use it for advertising, and you can delete everything at any time.",
      "Os teus recibos são privados da tua conta e só são partilhados com os serviços necessários para o Receebo funcionar, como a extração com IA. O acesso ao email é só de leitura e pode ser desligado a qualquer momento. Nunca vendemos os teus dados nem os usamos para publicidade, e podes apagar tudo a qualquer momento.",
      "Seus recibos são privados da sua conta e só são compartilhados com os serviços necessários para o Receebo funcionar, como a extração com IA. O acesso ao e-mail é somente leitura e pode ser desconectado a qualquer momento. Nunca vendemos seus dados nem os usamos para publicidade, e você pode apagar tudo a qualquer momento.",
    ),
  },
  {
    q: lt("Can I cancel anytime?", "Posso cancelar quando quiser?"),
    a: lt(
      "Yes, always. Cancel your subscription in one click from your account settings. You won't be charged after cancellation and your data remains accessible until the end of your billing period.",
      "Sim, sempre. Cancela a subscrição com um clique nas definições da conta. Não és cobrado depois do cancelamento e os teus dados continuam acessíveis até ao fim do período de faturação.",
      "Sim, sempre. Cancele a assinatura com um clique nas configurações da conta. Você não é cobrado depois do cancelamento e seus dados continuam acessíveis até o fim do período de cobrança.",
    ),
  },
  {
    q: lt("How does the free trial work?", "Como funciona o período experimental gratuito?", "Como funciona o teste grátis?"),
    a: lt(
      "Create an account and accept the Terms, and your trial starts. No card is needed. It lasts 15 days and you can add up to 5 receipts, by upload or email import. After your 5th receipt you can still view, search and export everything, and get warranty and return alerts, until day 15. Nothing is charged automatically. To keep going, choose €2.99/month or €24.99/year; you're charged when you subscribe. You can also upgrade early from Settings.",
      "Cria uma conta e aceita os Termos, e o período experimental começa. Não é preciso cartão. Dura 15 dias e podes adicionar até 5 recibos, por carregamento ou importação de email. Depois do 5.º recibo continuas a poder ver, pesquisar e exportar tudo, e a receber alertas de garantia e devolução, até ao dia 15. Nada é cobrado automaticamente. Para continuar, escolhe €2.99/mês ou €24.99/ano; és cobrado quando subscreves. Também podes fazer upgrade mais cedo nas Definições.",
      "Crie uma conta e aceite os Termos, e o teste começa. Não precisa de cartão. Dura 15 dias e você pode adicionar até 5 recibos, por envio ou importação de e-mail. Depois do 5º recibo você ainda pode ver, pesquisar e exportar tudo, e receber alertas de garantia e devolução, até o dia 15. Nada é cobrado automaticamente. Para continuar, escolha €2.99/mês ou €24.99/ano; a cobrança acontece quando você assina. Também pode fazer upgrade antes nas Configurações.",
    ),
  },
  {
    q: lt("What are founding prices?", "O que são preços de fundador?"),
    a: lt(
      "€2.99/month and €24.99/year are founding prices. They stay available to you for as long as your account exists, including if you cancel and subscribe again later.",
      "€2.99/mês e €24.99/ano são preços de fundador. Mantêm-se disponíveis para ti enquanto a tua conta existir, mesmo que canceles e voltes a subscrever mais tarde.",
      "€2.99/mês e €24.99/ano são preços de fundador. Continuam disponíveis para você enquanto sua conta existir, mesmo se cancelar e assinar de novo depois.",
    ),
  },
];
}

export default function FAQSection() {
  const faqs = buildFaqs(useAvailableMailProviders());
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-12"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>{lt("FAQ", "Perguntas frequentes")}</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            {lt("Questions? Answered.", "Dúvidas? Respondidas.")}
          </motion.h2>
        </motion.div>

        {/* Accordion */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map(({ q, a }, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="bg-background border border-border rounded-2xl px-5 overflow-hidden [&:not([data-state='open'])]:shadow-sm data-[state=open]:shadow-md transition-shadow"
              >
                <AccordionTrigger className="py-5 text-left font-semibold text-base hover:no-underline">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-5 text-sm">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
