/**
 * Copy and HTML of the lifecycle emails (Receebo marketing, 2 Nov 2026;
 * source: /workspace/receebo/lifecycle-emails.md, sections 1-3, report block
 * and footer). Pure: no DB, no sending. Three languages, from the account
 * language (Replit's EmailLocale): en, pt-PT and pt-BR. pt-PT copy is ours
 * (2 Nov 2026 brief: pt-PT accounts get pt-PT, superseding "pt-PT gets pt-BR").
 * English dates follow the account market (en-US for US accounts).
 *
 * Account notices: transactional, no unsubscribe link, one button each.
 */
import { escapeHtml, renderEmailLayout } from "./emailService";
import { formatEmailDate, type FormatLocale } from "./emailFormat";
import type { EmailLocale } from "./emailLocale";
import type { AccountReport } from "./lifecycleEmailStore";
import type { FeedbackRating } from "./feedbackToken";

export type DeletionStage = "30d" | "7d";

export interface RenderedEmail { subject: string; preheader: string; html: string; text: string }

const P_STYLE = "color:#444;font-size:15px;line-height:1.6;margin:0 0 16px;";
const REPORT_BOX_STYLE = "background:#F5F5F5;border:1px solid #E6E6E6;border-radius:8px;padding:16px 18px;margin:0 0 20px;";
const REPORT_TITLE_STYLE = "font-size:13px;font-weight:700;color:#121212;margin:0 0 8px;";
const REPORT_LINE_STYLE = "font-size:15px;color:#333;line-height:1.6;margin:0;";
const SMILE_STYLE = "display:inline-block;font-size:34px;line-height:44px;text-decoration:none;margin:0 14px 0 0;";
const SECONDARY_STYLE = "color:#737373;font-size:14px;line-height:1.6;margin:20px 0 16px;";
const SIGN_STYLE = "color:#444;font-size:15px;line-height:1.6;margin:24px 0 0;";

const COPY = {
  en: {
    hi: (name: string | null) => name ? `Hi ${name},` : "Hi there,",
    team: "The Receebo team",
    slogan: "Receipts. Easy to find.",
    reportTitle: "Your Receebo so far:",
    reportEmpty: "You didn't get to add a receipt this time, and that's okay.",
    report: {
      receiptsSaved: (n: number) => n === 1 ? "1 receipt saved" : `${n} receipts saved`,
      returnWindowsTracked: (n: number) => n === 1 ? "1 return window tracked" : `${n} return windows tracked`,
      warrantiesTracked: (n: number) => n === 1 ? "1 warranty tracked" : `${n} warranties tracked`,
      alertsSent: (n: number) => n === 1 ? "1 alert sent" : `${n} alerts sent`,
    },
    footer: "You're getting this because you have (or had) a Receebo account. This is an account notice, so it's sent even if you've turned off tips and news.",
    privacy: "Privacy",
    smileLabels: { good: "Good", ok: "Okay", bad: "Not good" },
  },
  "pt-PT": {
    hi: (name: string | null) => name ? `Olá ${name},` : "Olá,",
    team: "A equipa Receebo",
    slogan: "Recibos. Fáceis de encontrar.",
    reportTitle: "O seu Receebo até agora:",
    reportEmpty: "Desta vez não chegou a guardar nenhum recibo, e não faz mal.",
    report: {
      receiptsSaved: (n: number) => n === 1 ? "1 recibo guardado" : `${n} recibos guardados`,
      returnWindowsTracked: (n: number) => n === 1 ? "1 prazo de devolução acompanhado" : `${n} prazos de devolução acompanhados`,
      warrantiesTracked: (n: number) => n === 1 ? "1 garantia acompanhada" : `${n} garantias acompanhadas`,
      alertsSent: (n: number) => n === 1 ? "1 alerta enviado" : `${n} alertas enviados`,
    },
    footer: "Recebe este email porque tem (ou teve) uma conta no Receebo. É um aviso sobre a sua conta, por isso é enviado mesmo que tenha desativado dicas e novidades.",
    privacy: "Privacidade",
    smileLabels: { good: "Bom", ok: "Mais ou menos", bad: "Mau" },
  },
  "pt-BR": {
    hi: (name: string | null) => name ? `Olá, ${name},` : "Olá,",
    team: "Equipe Receebo",
    slogan: "Recibos. Fáceis de encontrar.",
    reportTitle: "Seu Receebo até aqui:",
    reportEmpty: "Você não chegou a salvar um recibo desta vez, e tudo bem.",
    report: {
      receiptsSaved: (n: number) => n === 1 ? "1 recibo salvo" : `${n} recibos salvos`,
      returnWindowsTracked: (n: number) => n === 1 ? "1 prazo de devolução acompanhado" : `${n} prazos de devolução acompanhados`,
      warrantiesTracked: (n: number) => n === 1 ? "1 garantia acompanhada" : `${n} garantias acompanhadas`,
      alertsSent: (n: number) => n === 1 ? "1 alerta enviado" : `${n} alertas enviados`,
    },
    footer: "Você está recebendo este e-mail porque tem (ou teve) uma conta no Receebo. É um aviso sobre a sua conta e por isso chega mesmo que você tenha desativado dicas e novidades.",
    privacy: "Privacidade",
    smileLabels: { good: "Bom", ok: "Mais ou menos", bad: "Ruim" },
  },
} as const;

const SMILES: Record<FeedbackRating, string> = { good: "😀", ok: "😐", bad: "🙁" };
const REPORT_KEYS = ["receiptsSaved", "returnWindowsTracked", "warrantiesTracked", "alertsSent"] as const;

/** Lines with a value > 0, pluralised per locale; empty when everything is 0. */
export function reportLines(report: AccountReport, locale: EmailLocale): string[] {
  const c = COPY[locale].report;
  return REPORT_KEYS.filter((k) => report[k] > 0).map((k) => c[k](report[k]));
}

function reportBlockHtml(report: AccountReport, locale: EmailLocale): string {
  const lines = reportLines(report, locale);
  if (lines.length === 0) return `<p style="${P_STYLE}">${escapeHtml(COPY[locale].reportEmpty)}</p>`;
  return `<div style="${REPORT_BOX_STYLE}">
    <p style="${REPORT_TITLE_STYLE}">${escapeHtml(COPY[locale].reportTitle)}</p>
    ${lines.map((l) => `<p style="${REPORT_LINE_STYLE}">${escapeHtml(l)}</p>`).join("\n    ")}
  </div>`;
}

function reportBlockText(report: AccountReport, locale: EmailLocale): string[] {
  const lines = reportLines(report, locale);
  if (lines.length === 0) return [COPY[locale].reportEmpty];
  return [COPY[locale].reportTitle, ...lines.map((l) => `- ${l}`)];
}

/** "**bold**" segments -> <strong>; everything else escaped. */
function rich(text: string): string {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part) =>
    part.startsWith("**") && part.endsWith("**") ? `<strong>${escapeHtml(part.slice(2, -2))}</strong>` : escapeHtml(part),
  ).join("");
}
const plain = (text: string) => text.replace(/\*\*/g, "");
const para = (text: string) => `<p style="${P_STYLE}">${rich(text)}</p>`;
const link = (label: string, href: string) => `<a href="${escapeHtml(href)}" style="color:#444;text-decoration:underline;">${escapeHtml(label)}</a>`;

function firstNameOf(name: string | null | undefined): string | null {
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 40) : null;
}

function footerHtml(locale: EmailLocale, privacyUrl: string): string {
  return `${escapeHtml(COPY[locale].footer)}<br>Receebo · receebo.net · <a href="${escapeHtml(privacyUrl)}" style="color:#999;">${escapeHtml(COPY[locale].privacy)}</a>`;
}

function footerText(locale: EmailLocale, privacyUrl: string): string {
  return `--\n${COPY[locale].footer}\nReceebo · receebo.net · ${COPY[locale].privacy}: ${privacyUrl}`;
}

function preheaderHtml(preheader: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`;
}

function signOff(locale: EmailLocale, withSlogan: boolean, lead?: string): { html: string; text: string[] } {
  const c = COPY[locale];
  const lines = [...(lead ? [lead] : []), c.team];
  return {
    html: `<p style="${SIGN_STYLE}">${lines.map(escapeHtml).join("<br>")}${withSlogan ? `<br><em>${escapeHtml(c.slogan)}</em>` : ""}</p>`,
    text: [...lines, ...(withSlogan ? [c.slogan] : [])],
  };
}

export interface CommonInput {
  locale: EmailLocale;
  /** Date format; defaults to the copy language ("en" = en-GB style). Pass "en-US" for US-market accounts. */
  formatLocale?: FormatLocale;
  firstName?: string | null;
  privacyUrl: string;
}

function dateFor(input: CommonInput, date: Date): string {
  return formatEmailDate(date, input.locale === "en" ? (input.formatLocale === "en-US" ? "en-US" : "en") : input.locale) ?? "";
}

// ── 1. Trial ended without a subscription ────────────────────────────────────

export function renderTrialEndedEmail(input: CommonInput & {
  report: AccountReport;
  deletionDate: Date;
  subscribeUrl: string;
  /** Signed rating links; omitted (no smile row) when no signing key is configured. */
  ratingUrls?: Record<FeedbackRating, string> | null;
}): RenderedEmail {
  const { locale } = input;
  const c = COPY[locale];
  const name = firstNameOf(input.firstName);
  const date = dateFor(input, input.deletionDate);
  const t = locale === "pt-PT" ? {
    subject: name ? `Obrigado por experimentar o Receebo, ${name}` : "Obrigado por experimentar o Receebo",
    preheader: "Veja o que o Receebo fez por si e diga-nos como correu.",
    intro: "O seu teste gratuito de 15 dias terminou hoje. Obrigado por experimentar o Receebo.",
    how: "**Como correu?** Basta um toque:",
    paused: "**Os seus alertas e o acompanhamento estão em pausa.** Não voltamos a avisar antes do fim dos prazos de devolução e das garantias até subscrever.",
    kept: `Os seus recibos ficam guardados durante 60 dias, até ${date}. Subscreva quando quiser antes dessa data e tudo continua onde ficou.`,
    cta: "Manter os meus alertas",
    questions: "Dúvidas? Basta responder a este email.",
  } : locale === "pt-BR" ? {
    subject: name ? `Obrigado por testar o Receebo, ${name}` : "Obrigado por testar o Receebo",
    preheader: "Veja o que o Receebo fez por você e conte como foi.",
    intro: "Seu teste grátis de 15 dias terminou hoje. Obrigado por experimentar o Receebo.",
    how: "**Como foi?** Basta um toque:",
    paused: "**Seus alertas e o monitoramento estão pausados.** Não vamos mais avisar antes do fim dos prazos de devolução e das garantias até você assinar.",
    kept: `Seus recibos ficam guardados por 60 dias, até ${date}. Assine quando quiser antes disso e tudo continua de onde parou.`,
    cta: "Manter meus alertas",
    questions: "Dúvidas? É só responder este e-mail.",
  } : {
    subject: name ? `Thanks for trying Receebo, ${name}` : "Thanks for trying Receebo",
    preheader: "Here's what Receebo did for you, and how it went.",
    intro: "Your 15-day free trial ended today. Thank you for giving Receebo a try.",
    how: "**How was it?** One tap is enough:",
    paused: "**Your alerts and monitoring are now paused.** We won't remind you before return windows or warranties run out until you subscribe.",
    kept: `Your receipts are kept safe for 60 days, until ${date}. Subscribe anytime before then and everything picks up where you left off.`,
    cta: "Keep my alerts on",
    questions: "Questions? Just reply to this email.",
  };
  const rating = input.ratingUrls;
  const smilesHtml = rating ? `<p style="${P_STYLE}">${rich(t.how)}</p>
  <p style="margin:0 0 20px;">${(["good", "ok", "bad"] as const).map((v) =>
    `<a href="${escapeHtml(rating[v])}" style="${SMILE_STYLE}" title="${escapeHtml(c.smileLabels[v])}" aria-label="${escapeHtml(c.smileLabels[v])}">${SMILES[v]}</a>`).join("")}</p>` : "";
  const sign = signOff(locale, true, t.questions);
  const html = renderEmailLayout({
    locale,
    eyebrow: "Receebo",
    bodyHtml: `${preheaderHtml(t.preheader)}
  <p style="${P_STYLE}">${escapeHtml(c.hi(name))}</p>
  ${para(t.intro)}
  ${smilesHtml}
  ${reportBlockHtml(input.report, locale)}
  ${para(t.paused)}
  ${para(t.kept)}`,
    cta: { label: t.cta, href: input.subscribeUrl },
    footerHtml: footerHtml(locale, input.privacyUrl),
  });
  const withSign = insertBeforeFooter(html, sign.html);
  const text = [
    c.hi(name), "", t.intro, "",
    ...(rating ? [plain(t.how), `😀 ${rating.good}`, `😐 ${rating.ok}`, `🙁 ${rating.bad}`, ""] : []),
    ...reportBlockText(input.report, locale), "",
    plain(t.paused), "", t.kept, "",
    `${t.cta}: ${input.subscribeUrl}`, "",
    ...sign.text, "",
    footerText(locale, input.privacyUrl),
  ].join("\n");
  return { subject: t.subject, preheader: t.preheader, html: withSign, text };
}

/** The sign-off goes after the button and before the footer. */
function insertBeforeFooter(html: string, block: string): string {
  const idx = html.lastIndexOf("\n  <p style=\"color:#bbb;");
  return idx === -1 ? html.replace("</body>", `  ${block}\n</body>`) : `${html.slice(0, idx)}\n  ${block}${html.slice(idx)}`;
}

// ── 2. Deletion warnings (30 and 7 days before) ──────────────────────────────

export function renderDeletionWarningEmail(input: CommonInput & {
  stage: DeletionStage;
  report: AccountReport;
  deletionDate: Date;
  subscribeUrl: string;
  /** Where to ask for / get a copy of the receipts (always shown, plain text link). */
  exportUrl: string;
}): RenderedEmail {
  const { locale, stage } = input;
  const c = COPY[locale];
  const name = firstNameOf(input.firstName);
  const date = dateFor(input, input.deletionDate);
  const pt = locale === "pt-BR";
  const ptPT = locale === "pt-PT";
  const t = stage === "30d" ? (ptPT ? {
    subject: `Os seus recibos do Receebo serão eliminados a ${date}`,
    preheader: "Tem 30 dias para os manter. Veja o que guardou.",
    before: ["Obrigado por confiar no Receebo."],
    after: [
      `Não tem uma subscrição ativa, por isso a **${date}** vamos eliminar definitivamente a sua conta e tudo o que ela contém: recibos, ficheiros carregados, as datas que acompanhámos por si e a ligação ao Outlook. Esta ação não pode ser desfeita.`,
      "Para manter tudo, basta subscrever antes dessa data. Os seus alertas voltam de imediato.",
    ],
    cta: "Manter os meus recibos",
    exportPre: "Prefere sair? Pode ", exportLabel: "pedir uma cópia dos seus recibos", exportPost: " antes disso.",
  } : pt ? {
    subject: `Seus recibos do Receebo serão excluídos em ${date}`,
    preheader: "Você tem 30 dias para mantê-los. Veja o que você salvou.",
    before: ["Obrigado por acreditar no Receebo."],
    after: [
      `Você não tem uma assinatura ativa, então em **${date}** vamos excluir de forma definitiva sua conta e tudo o que há nela: recibos, arquivos enviados, as datas que acompanhamos para você e a conexão com o Outlook. Isso não pode ser desfeito.`,
      "Para manter tudo, é só assinar antes dessa data. Seus alertas voltam na hora.",
    ],
    cta: "Manter meus recibos",
    exportPre: "Prefere sair? Você pode ", exportLabel: "pedir uma cópia dos seus recibos", exportPost: " antes.",
  } : {
    subject: `Your Receebo receipts will be deleted on ${date}`,
    preheader: "You have 30 days to keep them. Here's what you've saved.",
    before: ["Thank you for believing in Receebo."],
    after: [
      `You don't have an active subscription, so on **${date}** we'll permanently delete your account and everything in it: your receipts, uploaded files, the dates we tracked for you and your Outlook connection. This can't be undone.`,
      "To keep it all, subscribe before then. Your alerts come back on right away.",
    ],
    cta: "Keep my receipts",
    exportPre: "Prefer to leave? You can ", exportLabel: "ask us for a copy of your receipts", exportPost: " first.",
  }) : (ptPT ? {
    subject: "Faltam 7 dias para manter os seus recibos no Receebo",
    preheader: `A ${date} a sua conta será eliminada. Um toque mantém tudo.`,
    before: [`Um lembrete rápido: daqui a 7 dias, a **${date}**, vamos eliminar definitivamente a sua conta do Receebo.`],
    after: ["Depois dessa data, os seus recibos, ficheiros e datas acompanhadas deixam de existir e não podem ser recuperados. Se subscrever antes, nada muda, a não ser que os seus alertas voltam a funcionar."],
    cta: "Manter os meus recibos",
    exportPre: "Não vai voltar? Não há problema. ", exportLabel: "Peça uma cópia dos seus recibos", exportPost: ` antes de ${date}. Obrigado por ter feito parte do Receebo.`,
  } : pt ? {
    subject: "Faltam 7 dias para manter seus recibos no Receebo",
    preheader: `Em ${date} sua conta será excluída. Um toque mantém tudo.`,
    before: [`Um lembrete rápido: daqui a 7 dias, em **${date}**, vamos excluir sua conta do Receebo de forma definitiva.`],
    after: ["Depois dessa data, seus recibos, arquivos e datas acompanhadas deixam de existir e não podem ser recuperados. Se você assinar antes, nada muda, só que seus alertas voltam a funcionar."],
    cta: "Manter meus recibos",
    exportPre: "Não vai voltar? Sem problema. ", exportLabel: "Peça uma cópia dos seus recibos", exportPost: ` antes de ${date}. Obrigado por fazer parte do Receebo.`,
  } : {
    subject: "7 days left to keep your Receebo receipts",
    preheader: `On ${date} your account will be deleted. One tap keeps everything.`,
    before: [`A quick, friendly reminder: in 7 days, on **${date}**, we'll delete your Receebo account for good.`],
    after: ["After that date your receipts, files and tracked dates are gone and can't be recovered. Subscribe before then and nothing changes, apart from your alerts coming back on."],
    cta: "Keep my receipts",
    exportPre: "Not coming back? No problem. ", exportLabel: "Ask us for a copy of your receipts", exportPost: ` before ${date}. Thanks for being part of Receebo.`,
  });
  const secondaryHtml = `<p style="${SECONDARY_STYLE}">${escapeHtml(t.exportPre)}${link(t.exportLabel, input.exportUrl)}${escapeHtml(t.exportPost)}</p>`;
  const sign = signOff(locale, false);
  const html = insertBeforeFooter(renderEmailLayout({
    locale,
    eyebrow: "Receebo",
    bodyHtml: `${preheaderHtml(t.preheader)}
  <p style="${P_STYLE}">${escapeHtml(c.hi(name))}</p>
  ${t.before.map(para).join("\n  ")}
  ${reportBlockHtml(input.report, locale)}
  ${t.after.map(para).join("\n  ")}`,
    cta: { label: t.cta, href: input.subscribeUrl },
    footerHtml: footerHtml(locale, input.privacyUrl),
  }), `${secondaryHtml}\n  ${sign.html}`);
  const text = [
    c.hi(name), "",
    ...t.before.flatMap((l) => [plain(l), ""]),
    ...reportBlockText(input.report, locale), "",
    ...t.after.flatMap((l) => [plain(l), ""]),
    `${t.cta}: ${input.subscribeUrl}`, "",
    `${t.exportPre}${t.exportLabel} (${input.exportUrl})${t.exportPost}`,
    ...sign.text, "",
    footerText(locale, input.privacyUrl),
  ].join("\n");
  return { subject: t.subject, preheader: t.preheader, html, text };
}

// ── 3. Account deleted ────────────────────────────────────────────────────────

export function renderAccountDeletedEmail(input: CommonInput & {
  /** "inactive": the 60-day deletion (approved copy). "requested": the user deleted it (adapted first sentence). */
  reason: "inactive" | "requested";
  /** Receipts deleted (counted before deleting); 0/undefined omits the clause. */
  deletedReceiptsCount?: number | null;
  signupUrl: string;
}): RenderedEmail {
  const { locale } = input;
  const c = COPY[locale];
  const name = firstNameOf(input.firstName);
  const n = input.deletedReceiptsCount ?? 0;
  const pt = locale === "pt-BR";
  const ptPT = locale === "pt-PT";
  const receiptsClause = n > 0 ? (ptPT ? (n === 1 ? " e o seu recibo" : ` e os seus ${n} recibos`) : pt ? (n === 1 ? " e seu recibo" : ` e seus ${n} recibos`) : (n === 1 ? " and your receipt" : ` and your ${n} receipts`)) : "";
  const opening = ptPT
    ? (input.reason === "inactive" ? "Como avisámos" : "Como pediu")
    : pt
    ? (input.reason === "inactive" ? "Como avisamos" : "Como você pediu")
    : (input.reason === "inactive" ? "As announced" : "As you asked");
  const t = ptPT ? {
    subject: "A sua conta do Receebo foi eliminada",
    preheader: "Obrigado por usar o Receebo. Volte quando quiser.",
    lines: [
      `${opening}, eliminámos a sua conta do Receebo${receiptsClause}. Guardamos apenas os registos de faturação que a lei exige.`,
      "Obrigado por ter dado um lugar ao Receebo no seu dia a dia. Se um dia quiser voltar a ter um sítio para os seus recibos, pode recomeçar quando quiser.",
    ],
    cta: "Começar de novo",
  } : pt ? {
    subject: "Sua conta do Receebo foi excluída",
    preheader: "Obrigado por usar o Receebo. Volte quando quiser.",
    lines: [
      `${opening}, excluímos sua conta do Receebo${receiptsClause}. Guardamos apenas os registros de cobrança que a lei exige.`,
      "Obrigado por dar um espaço ao Receebo no seu dia a dia. Se um dia quiser de novo um lugar para seus recibos, é só recomeçar.",
    ],
    cta: "Começar de novo",
  } : {
    subject: "Your Receebo account has been deleted",
    preheader: "Thank you for trying Receebo. You're welcome back anytime.",
    lines: [
      `${opening}, we've deleted your Receebo account${receiptsClause}. We only keep the billing records the law requires us to keep.`,
      "Thank you for giving Receebo a place in your day. If you ever want a home for your receipts again, you can start fresh anytime.",
    ],
    cta: "Start again",
  };
  const sign = signOff(locale, true);
  const html = insertBeforeFooter(renderEmailLayout({
    locale,
    eyebrow: "Receebo",
    bodyHtml: `${preheaderHtml(t.preheader)}
  <p style="${P_STYLE}">${escapeHtml(c.hi(name))}</p>
  ${t.lines.map(para).join("\n  ")}`,
    cta: { label: t.cta, href: input.signupUrl },
    footerHtml: footerHtml(locale, input.privacyUrl),
  }), sign.html);
  const text = [
    c.hi(name), "", ...t.lines.flatMap((l) => [l, ""]),
    `${t.cta}: ${input.signupUrl}`, "",
    ...sign.text, "",
    footerText(locale, input.privacyUrl),
  ].join("\n");
  return { subject: t.subject, preheader: t.preheader, html, text };
}
