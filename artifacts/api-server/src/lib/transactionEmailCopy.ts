import type { EmailLocale } from "./emailLocale";
import { formatEmailDate } from "./emailFormat";

export function deletionWarningCopy(input: {
  stage: "30d" | "7d"; deletionDate: Date; receiptCount: number; firstName?: string | null;
}, locale: EmailLocale) {
  const date = formatEmailDate(input.deletionDate, locale) ?? "";
  const br = locale === "pt-BR";
  const receipts = `${input.receiptCount} ${input.receiptCount === 1 ? "recibo" : "recibos"}`;
  return {
    subject: input.stage === "30d" ? `Os seus recibos do Receebo serão eliminados em ${date}` : "Faltam 7 dias para eliminarmos os seus recibos",
    heading: `${input.stage === "7d" ? "Último lembrete: os" : "Os"} seus recibos serão eliminados em ${date}`,
    greeting: input.firstName ? `Olá ${input.firstName},` : "Olá,",
    lines: [
      `A sua conta está em pausa por não ter uma ${br ? "assinatura" : "subscrição"} ativa do Receebo. Em ${date}, eliminaremos permanentemente a conta e todos os seus dados, incluindo ${receipts} e as datas de garantia. Esta ação não pode ser desfeita.`,
      br ? "Para manter os seus dados, assine antes dessa data. A assinatura cancela a exclusão." : "Para manter os seus dados, subscreva antes dessa data. A subscrição cancela a eliminação.",
      "Quer primeiro uma cópia dos ficheiros? Escreva para contact@receebo.net e enviaremos a cópia."
        .replace("ficheiros", br ? "arquivos" : "ficheiros"),
    ],
    reason: "Recebe esta mensagem porque a sua conta Receebo está em pausa.",
    eyebrow: input.stage === "30d" ? "Receebo — Conta em pausa" : "Receebo — Último lembrete",
    cta: "Manter os meus recibos",
  };
}

export function accountDeletedCopy(reason: "inactive" | "requested", locale: EmailLocale) {
  const br = locale === "pt-BR";
  return {
    subject: `A sua conta Receebo foi ${br ? "excluída" : "eliminada"}`,
    heading: `A sua conta foi ${br ? "excluída" : "eliminada"}`,
    eyebrow: `Receebo — Conta ${br ? "excluída" : "eliminada"}`,
    lines: [
      reason === "inactive"
        ? `Conforme anunciado, eliminámos a sua conta Receebo por ter estado sem uma ${br ? "assinatura" : "subscrição"} ativa durante 60 dias.`
        : "Conforme solicitado, eliminámos a sua conta Receebo.",
      `Eliminámos a sua conta, recibos, ${locale === "pt-BR" ? "arquivos enviados" : "ficheiros carregados"}, dados extraídos e qualquer ligação ao Outlook. Conservamos apenas os registos de faturação exigidos por lei.`,
      "Se quiser voltar a começar, será sempre bem-vindo em https://receebo.net.",
    ].map(line => locale === "pt-BR" ? line.replaceAll("eliminámos", "excluímos").replaceAll("Eliminámos", "Excluímos").replace("ligação", "conexão").replace("registos de faturação", "registros de cobrança") : line),
    reason: `Recebe esta mensagem para confirmar que a sua conta Receebo foi ${br ? "excluída" : "eliminada"}.`,
  };
}

export function deletionCodeCopy(minutes: number, locale: EmailLocale) {
  const br = locale === "pt-BR";
  return {
    subject: `Confirme a ${br ? "exclusão" : "eliminação"} da sua conta Receebo`,
    preheader: `Use o código nesta mensagem para confirmar. Expira em ${minutes} minutos.`,
    eyebrow: `Receebo — ${br ? "Exclusão solicitada" : "Eliminação solicitada"}`,
    heading: `Confirme que pretende ${br ? "excluir" : "eliminar"} a sua conta.`,
    intro: `Pediu para ${br ? "excluir" : "eliminar"} a sua conta Receebo. Para confirmar, introduza este código no Receebo. Esta ação elimina permanentemente a conta e todos os recibos e não pode ser desfeita.`,
    codeLabel: "O seu código",
    expiry: `Este código expira em ${minutes} minutos e só pode ser usado uma vez.`,
    notYou: `Não fez este pedido? Ignore esta mensagem e a sua conta não será alterada. Se suspeitar que outra pessoa consegue aceder à sua conta, escreva para contact@receebo.net.`
      .replace("aceder", br ? "acessar" : "aceder"),
    reason: `Recebe esta mensagem porque foi pedida a ${br ? "exclusão" : "eliminação"} da conta Receebo associada a este endereço de e-mail.`,
  };
}

/** Structured billing facts, not English prose that must be parsed/translated. */
export interface PaymentAccess {
  owner: boolean;
  /** Future access cutoff, or null if access has ended. */
  continuesUntil: Date | null;
}

export function paymentCopy(access: PaymentAccess, locale: EmailLocale) {
  if (locale === "en") return access.owner
    ? "Your Owner access is unchanged, but your subscription has an outstanding payment."
    : access.continuesUntil
      ? `Your Pro access continues until ${access.continuesUntil.toUTCString()}. Update your payment details before then to avoid losing access.`
      : "Your Pro access has ended. Update your payment details and settle the outstanding invoice to restore access.";
  const update = "Atualize os dados de pagamento";
  return access.owner
    ? "O seu acesso de proprietário não foi alterado, mas existe um pagamento pendente na sua assinatura."
    : access.continuesUntil
      ? `O seu acesso Pro mantém-se até ${formatEmailDate(access.continuesUntil, locale)} (${access.continuesUntil.toISOString()} UTC). ${update} antes dessa data para não perder o acesso.`
      : `O seu acesso Pro terminou. ${update} e liquide a fatura pendente para recuperar o acesso.`;
}
