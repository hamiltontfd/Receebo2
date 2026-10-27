/**
 * Consumer-rights panel strings per locale.
 *
 * [LEGAL REVIEW NEEDED] Every BR and US string here is a draft based on
 * /workspace/receebo/consumer-rules-br-us.md (not reviewed by a lawyer).
 * PT strings keep the current app wording. Marketing owns final copy.
 */
import type { AppLocale } from "./locale";

export interface RightsCopy {
  returnSourceStorePolicy: (merchant: string) => string;
  returnSourceTypicalStorePolicy: (merchant: string) => string;
  legalWarrantyYears: (years: number) => string;
  brComplaintDeadline: (days: number) => string;
  manufacturerWarranty: (months: number) => string;
  brHiddenDefectNote: string;
  brRepairNote: string;
  brWithdrawalNote: string;
  usNoStatutoryNote: string;
  /** Unknown channel at a known retailer: point to the store policy, no deadline. */
  unknownChannelStorePolicy: (merchant: string, days: number) => string;
  disclaimer: string;
  legalReviewMarker: string;
}

const LEGAL_REVIEW = "[LEGAL REVIEW NEEDED]";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

const en: RightsCopy = {
  returnSourceStorePolicy: (m) => `${m} return policy`,
  returnSourceTypicalStorePolicy: (m) => `${m} return policy (typical, check with the store)`,
  legalWarrantyYears: (y) => `${y}-year legal warranty`,
  brComplaintDeadline: (d) => `Legal guarantee (CDC): ${d} days to report defects`,
  manufacturerWarranty: (m) => m % 12 === 0 ? `Manufacturer warranty (${plural(m / 12, "year", "years")})` : `Manufacturer warranty (${plural(m, "month", "months")})`,
  brHiddenDefectNote: "Hidden defect? The deadline starts when the defect shows up (CDC art. 26 §3).",
  brRepairNote: "If the seller doesn't fix it within 30 days, you can choose a replacement, a refund or a price reduction (CDC art. 18 §1).",
  brWithdrawalNote: "Bought online? You can withdraw within 7 days of receiving it, with a full refund (CDC art. 49).",
  usNoStatutoryNote: "No federal minimum warranty or return right in the US: check the written warranty and the store's policy.",
  unknownChannelStorePolicy: (m, d) => `Not clear from the receipt whether this was bought online or in store. ${m} usually allows ${d} days for returns: check the store's policy.`,
  disclaimer: "General information, not legal advice. Check with the seller.",
  legalReviewMarker: LEGAL_REVIEW,
};

const ptBR: RightsCopy = {
  returnSourceStorePolicy: (m) => `Política de troca da ${m}`,
  returnSourceTypicalStorePolicy: (m) => `Política de troca da ${m} (usual, confirme com a loja)`,
  legalWarrantyYears: (y) => `Garantia legal de ${plural(y, "ano", "anos")}`,
  brComplaintDeadline: (d) => `Garantia legal (CDC): ${d} dias para reclamar de defeitos`,
  manufacturerWarranty: (m) => m % 12 === 0 ? `Garantia do fabricante (${plural(m / 12, "ano", "anos")})` : `Garantia do fabricante (${plural(m, "mês", "meses")})`,
  brHiddenDefectNote: "Defeito oculto? O prazo começa quando o defeito aparece (CDC art. 26, §3º).",
  brRepairNote: "Se o fornecedor não resolver em 30 dias, você pode escolher a troca, o dinheiro de volta ou um abatimento no preço (CDC art. 18, §1º).",
  brWithdrawalNote: "Comprou pela internet? Você tem 7 dias, contados do recebimento, para desistir com reembolso total (CDC art. 49).",
  usNoStatutoryNote: "Nos EUA não há garantia mínima nem direito de devolução federal: confira a garantia escrita e a política da loja.",
  unknownChannelStorePolicy: (m, d) => `Não dá para saber pelo recibo se a compra foi online ou na loja. A ${m} costuma aceitar devoluções em ${d} dias: confira a política da loja.`,
  disclaimer: "Informações gerais, sem caráter de assessoria jurídica. Em caso de dúvida, procure o Procon.",
  legalReviewMarker: LEGAL_REVIEW,
};

const ptPT: RightsCopy = {
  returnSourceStorePolicy: (m) => `Política de devolução da ${m}`,
  returnSourceTypicalStorePolicy: (m) => `Política de devolução da ${m} (habitual, confirme com a loja)`,
  legalWarrantyYears: (y) => `Garantia legal de ${plural(y, "ano", "anos")}`,
  brComplaintDeadline: (d) => `Garantia legal (CDC): ${d} dias para reclamar de defeitos`,
  manufacturerWarranty: (m) => m % 12 === 0 ? `Garantia do fabricante (${plural(m / 12, "ano", "anos")})` : `Garantia do fabricante (${plural(m, "mês", "meses")})`,
  brHiddenDefectNote: "Defeito oculto? O prazo começa quando o defeito se manifesta (CDC art. 26, §3).",
  brRepairNote: "Se o fornecedor não resolver em 30 dias, pode escolher a substituição, o reembolso ou a redução do preço (CDC art. 18, §1).",
  brWithdrawalNote: "Comprou online? Tem 7 dias, a contar da receção, para desistir com reembolso total (CDC art. 49).",
  usNoStatutoryNote: "Nos EUA não existe garantia mínima nem direito de devolução federal: confirme a garantia escrita e a política da loja.",
  unknownChannelStorePolicy: (m, d) => `Não é claro pelo recibo se a compra foi online ou na loja. A ${m} costuma aceitar devoluções em ${d} dias: confirme a política da loja.`,
  disclaimer: "Informação geral, não é aconselhamento jurídico. Confirme com o vendedor.",
  legalReviewMarker: LEGAL_REVIEW,
};

const COPY: Record<AppLocale, RightsCopy> = { en, "pt-BR": ptBR, "pt-PT": ptPT };

export function rightsCopy(locale: AppLocale = "en"): RightsCopy {
  return COPY[locale] ?? en;
}
