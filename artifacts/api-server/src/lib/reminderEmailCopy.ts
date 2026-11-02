import { formatEmailDate, formatMoney } from "./emailFormat";
import type { EmailLocale } from "./emailLocale";
import {
  reminderItemNames, ITEM_MAX_CHARS, type ReminderMessage,
  type ReturnReminderInput, type WarrantyReminderInput,
} from "./reminderCopy";

/** Email-only translations. The existing push copy and scheduling stay unchanged.
 * No legal inference: kind/basis/windowDays and deadlines come from the receipt. */
function parts(input: ReturnReminderInput | WarrantyReminderInput, locale: EmailLocale) {
  const names = reminderItemNames(input).map(n => n.length > ITEM_MAX_CHARS ? `${n.slice(0, ITEM_MAX_CHARS - 1).trimEnd()}…` : n);
  const item = names[0];
  const merchant = input.merchant?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const bought = input.purchaseDate ? formatEmailDate(input.purchaseDate, locale) : null;
  const amount = typeof input.total === "number" && Number.isFinite(input.total)
    ? formatMoney(input.total, input.currency, locale) : null;
  const items = names.length > 2 ? `${names[0]}, ${names[1]} + ${names.length - 2} mais`
    : names.join(" e ");
  return {
    item, merchant, bought, amount,
    what: item ?? (merchant ? `a sua compra em ${merchant}` : "a sua compra"),
    itemLine: [items || null, amount, merchant, bought ? `compra em ${bought}` : null].filter(Boolean).join(" · "),
    boughtLine: [merchant ? `Compra em ${merchant}.` : null, bought ? `Data da compra: ${bought}.` : null].filter(Boolean).join(" "),
  };
}

export function localizedReturnReminder(input: ReturnReminderInput, locale: EmailLocale): Omit<ReminderMessage, "push"> {
  const p = parts(input, locale);
  const br = locale === "pt-BR";
  const date = formatEmailDate(input.deadline, locale) ?? "";
  const days = Math.max(0, Math.floor(input.daysRemaining));
  const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
  const what = `${p.what}${p.amount ? ` (${p.amount})` : ""}${!p.item && !p.amount && p.bought ? ` de ${p.bought}` : ""}`;
  return {
    subject: `O prazo de devolução de ${what} termina ${when}`,
    preheader: `${p.boughtLine} Último dia: ${date}.`.trim(),
    title: `${p.what}: prazo de devolução até ${date}`,
    itemLine: p.itemLine,
    secondary: p.item ? `${br ? "Ainda está satisfeito" : "Continua satisfeito"} com ${p.item}?` : null,
    body: `${br ? "Se não for ficar com a compra, inicie" : "Se não quiser ficar com a compra, inicie"} a devolução junto de ${p.merchant ?? "a loja"} até ${date}. O recibo está guardado no Receebo, caso seja necessário.`,
    note: input.basis === "store" && p.merchant
      ? `Com base na política de devolução ${input.holiday ? "de fim de ano " : ""}de ${p.merchant}. As condições variam; ${br ? "confira" : "consulte"} o recibo ou o site da loja.`
      : input.basis === "user"
        ? `Com base no prazo de devolução de ${input.windowDays ?? ""} dias que ${br ? "você salvou" : "guardou"} para este recibo.`.replace("de  dias", "")
      : input.basis === "law"
        ? `Com base no prazo de ${input.windowDays ?? 14} dias para ${br ? "arrependimento" : "livre resolução"} em compras online.`
        : null,
    footer: `Recebe esta mensagem porque os lembretes de devolução estão ${br ? "ativados" : "ativos"}.`,
  };
}

export function localizedWarrantyReminder(input: WarrantyReminderInput, locale: EmailLocale): Omit<ReminderMessage, "push"> {
  const p = parts(input, locale);
  const date = formatEmailDate(input.expiresOn, locale) ?? input.expiresOn;
  const label = input.kind === "legal" ? "Garantia legal" : "Garantia do fabricante";
  const otherDate = input.other ? formatEmailDate(input.other.expiresOn, locale) : null;
  return {
    subject: `${label} de ${p.what}${p.amount ? ` (${p.amount})` : ""}${!p.item && !p.amount && p.bought ? ` de ${p.bought}` : ""} termina em ${date}`,
    preheader: p.boughtLine || `${label} termina em ${date}.`,
    title: `${p.what}: ${label.toLowerCase()} termina em ${date}`,
    itemLine: p.itemLine, secondary: null,
    body: `Se algo não funcionar como deveria, contacte ${input.kind === "legal" ? (p.merchant ?? "a loja") : "o fabricante"} antes de ${date}. O recibo está guardado no Receebo como comprovativo de compra.`
      .replace("contacte", locale === "pt-BR" ? "contate" : "contacte")
      .replace("comprovativo", locale === "pt-BR" ? "comprovante" : "comprovativo"),
    note: input.other && otherDate
      ? `A sua ${input.other.kind === "legal" ? "garantia legal" : "garantia do fabricante"} é separada e mantém-se válida até ${otherDate}.`
      : null,
    footer: `Recebe esta mensagem porque os lembretes de garantia estão ${locale === "pt-BR" ? "ativados" : "ativos"}.`,
  };
}
