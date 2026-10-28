import type { MailMessage } from "./types";
import { merchantTier, type MerchantTier } from "./merchants";

/**
 * Heuristics that decide which emails are worth sending to the AI extractor.
 * The AI still rejects non-receipts (isReceipt=false); these rules only keep
 * cost and noise down.
 */

// Subject keywords (EN, PT, ES, FR, DE, IT) for orders, receipts, invoices and
// tickets. Word boundaries keep "compras"/"comprar" and "your purchases"
// (marketing) out while "compra", "Ordered:" and "Order #1" still match.
const SUBJECT_PATTERN =
  /(receipt|invoice|\border(ed)?\b|your purchase\b|purchase confirmation|payment confirmation|payment received|confirmation|shipped|dispatched|recibo|fatura|factura|encomenda|pedido|\bcompra\b|comprovativo|confirma[cç][aã]o|confirmaci[oó]n|commande|facture|reçu|rechnung|bestellung|quittung|beleg|ordine|ricevuta|fattura|bilhetes?|e-?tickets?|ingressos?)/i;

// Sender local-parts that send orders and receipts (strong on their own).
const SENDER_LOCAL_PATTERN =
  /(auto-confirm|order-update|orders?|receipts?|invoices?|billing|faturas?|faturacao|encomendas?|pedidos?|shipment-tracking|confirm(ation)?|purchases?)@/i;
// Store domains: on their own they also send marketing, so a domain match only
// counts with an attachment (a subject keyword or order sender is needed otherwise).
const SENDER_DOMAIN_PATTERN =
  /@(.+\.)?(amazon\.[a-z.]+|apple\.com|paypal\.[a-z.]+|aliexpress\.com|ebay\.[a-z.]+|zalando\.[a-z.]+|ikea\.com|fnac\.pt|worten\.pt|pccomponentes\.(pt|com)|decathlon\.[a-z.]+|leroymerlin\.pt|temu\.com|shein\.com|ticketline\.pt|seetickets\.com|everythingisnew\.pt|blueticket\.pt|eventbrite\.com|ticketmaster\.[a-z.]+)\b/i;

// Things that look like receipts by keyword but are almost never purchases:
// newsletters, account/security mail, review requests, debt-collection and
// customs-fee messages (often phishing), loyalty points.
const EXCLUDE_SUBJECT_PATTERN = new RegExp([
  "newsletter|unsubscribe|webinar|password reset|verify your (email|account)|security alert|sign-?in|log-?in attempt|meeting|calendar|invitation",
  "em atraso|vencid[ao]|em aberto|pagamento pendente|pendente de pagamento|aguardando pagamento|regulari[zs]|cobran[cç]a|suspens[aã]o|renegocia|desenrola|quitar|pague online|prazo encerrando|comunicado urgente|\\bpending\\b|^re:",
  "tribut|aduaneir|alf[aâ]ndega|taxad[ao]|retid[ao]|receita federal|minhas importa",
  "classificar|expectativas|satisfeit|avali(e|a[cç][aã]o)|rate your|review your|how did we do|feedback|inqu[eé]rito|enquiry",
  "c[oó]digo [uú]nico|c[oó]digo de (acesso|verifica)|novo acesso|acesso [àa] (sua )?conta|protect your .*account|vinculad[ao]|som foi reproduzido|pontos a expirar|points? (are )?expir",
].join("|"), "i");

// Parcel carriers only report deliveries; the store sends the receipt.
const CARRIER_SENDER_PATTERN =
  /@(.+\.)?(cttexpress\.com|ctt\.pt|paack\.co|dhl\.[a-z.]+|ups\.com|dpd\.[a-z.]+|gls-?[a-z]*\.[a-z.]+|seur\.com|nacex\.[a-z.]+|mrw\.[a-z.]+|correos\.[a-z.]+|chronopost\.[a-z.]+)\b/i;
// Mailing subdomains/addresses that only send marketing.
const MARKETING_SENDER_PATTERN =
  /(@(.+\.)?(marketing|newsletters?|news|promo(tions)?|insideapple|comunicaciones|loyalty|mail1)\.|@(.+\.)?temuemail\.com\b)/i;
// Emoji-heavy subjects are campaigns, not receipts.
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

export function looksLikeReceiptEmail(input: {
  subject: string | null;
  from: string | null;
  hasAttachments?: boolean;
}): boolean {
  const subject = input.subject ?? "";
  const from = input.from ?? "";
  if (subject && EXCLUDE_SUBJECT_PATTERN.test(subject)) return false;
  return SUBJECT_PATTERN.test(subject) || SENDER_LOCAL_PATTERN.test(from) ||
    (Boolean(input.hasAttachments) && SENDER_DOMAIN_PATTERN.test(from));
}

// Recurring bills (utilities, telecoms, subscriptions) are not purchases we import.
const UTILITY_SUBJECT_PATTERN =
  /(fatura|factura|conta) (de |da |do )?(eletricidade|electricidade|luz|g[aá]s|[aá]gua|telecomunica[cç][oõ]es|internet|telem[oó]vel)|electricity bill|utility bill|gas bill|water bill|phone bill|d[eé]bito direto|direct debit|aviso de pagamento|payment reminder|fatura mensal|monthly (bill|statement)|extrato/i;
// Strong purchase signals in the subject.
const STRONG_SUBJECT_PATTERN =
  /(fatura|factura|invoice|recibo|receipt|order confirm|confirma[cç][aã]o (da |de )?(encomenda|compra|pedido)|encomenda confirmada|pedido confirmado|your order|\border\b|a sua encomenda|\bencomenda\b|\bpedido\b|bilhete|e-?ticket|tickets?\b|ingressos?)/i;
const DURABLE_KEYWORD_PATTERN =
  /(port[aá]til|laptop|iphone|ipad|macbook|smartphone|telem[oó]vel|\btv\b|televis|frigor[ií]fico|m[aá]quina de lavar|aspirador|headphones|auscultadores|monitor|consola|playstation|xbox|nintendo|c[aâ]mara|camera|forno|micro-?ondas|bicicleta|smartwatch)/i;
const SHIPPING_ONLY_PATTERN =
  /(enviad[oa]|em tr[aâ]nsito|entregue|a caminho|chegou|a chegar|on the way|shipped|shipping|shipment|dispatched|out for delivery|delivered|delivery update|tracking|track your|envio|expedi[cç][aã]o|ponto de recolha|entrega em loja)/i;
const INVOICE_PATTERN = /(fatura|factura|invoice|recibo|receipt)/i;
const MARKETING_PATTERN = /(promo|desconto|% off|\bsale\b|saldos|black friday|newsletter|oferta|cup[aã]o|cup[oõ]es|coupon|b[oó]nus|pre-?order|rewards?|bring you credits|\bdeals?\b|\bvale\b)/i;

/** Minimum listing score sent to the AI. */
export const MIN_LISTING_SCORE = 20;

const TIER_SCORE: Record<Exclude<MerchantTier, "everyday">, number> = {
  durable: 40,
  tickets: 30,
  marketplace: 15,
};

export interface ListingOptions {
  /**
   * The sender is a recurring supplier the user set to "Always import"
   * (lib/recurringSuppliers.ts): its bills are imported even though utility
   * and everyday senders are skipped otherwise.
   */
  allowEveryday?: boolean;
}

export interface ListingScore {
  /** false = never sent to the AI (not receipt-like, everyday/utility, marketing, shipping-only). */
  include: boolean;
  score: number;
  reason: "not_receipt_like" | "everyday_sender" | "utility_bill" | "carrier" | "low_score" | "ok";
}

/**
 * Rank a listing (subject + sender + attachment flag) before any AI call.
 * Only clear purchase emails are included; the highest scores are read first
 * so the per-trial AI read cap goes to likely warranty/return items.
 */
export function scoreReceiptListing(input: {
  subject: string | null;
  from: string | null;
  hasAttachments?: boolean;
}, options: ListingOptions = {}): ListingScore {
  if (!looksLikeReceiptEmail(input)) return { include: false, score: 0, reason: "not_receipt_like" };
  const tier = options.allowEveryday ? null : merchantTier(input.from);
  if (tier === "everyday") return { include: false, score: 0, reason: "everyday_sender" };
  const subject = input.subject ?? "";
  if (!options.allowEveryday && UTILITY_SUBJECT_PATTERN.test(subject)) return { include: false, score: 0, reason: "utility_bill" };
  if (CARRIER_SENDER_PATTERN.test(input.from ?? "")) return { include: false, score: 0, reason: "carrier" };
  let score = 10;
  if (tier) score += TIER_SCORE[tier];
  if (STRONG_SUBJECT_PATTERN.test(subject)) score += 20;
  if (input.hasAttachments) score += 10;
  if (DURABLE_KEYWORD_PATTERN.test(subject)) score += 15;
  if (SHIPPING_ONLY_PATTERN.test(subject) && !INVOICE_PATTERN.test(subject)) score -= 20;
  if (MARKETING_PATTERN.test(subject)) score -= 40;
  const invoiceLike = INVOICE_PATTERN.test(subject);
  if (EMOJI_PATTERN.test(subject) && !invoiceLike) score -= 40;
  if (MARKETING_SENDER_PATTERN.test(input.from ?? "") && !invoiceLike && !input.hasAttachments) score -= 40;
  // A keyword alone (score 10) is not enough: it needs a store, a strong
  // purchase subject or an attachment (dev data: base-score emails were news).
  return score >= MIN_LISTING_SCORE ? { include: true, score, reason: "ok" } : { include: false, score, reason: "low_score" };
}

/** Cheap pre-filter on list results (subject + sender only). */
export function isLikelyReceiptListing(input: {
  subject: string | null;
  from: string | null;
  hasAttachments?: boolean;
}): boolean {
  return scoreReceiptListing(input).include;
}

export type MessageImportPlan =
  | { kind: "pdf"; attachments: MailMessage["pdfAttachments"] }
  | { kind: "html"; text: string }
  | { kind: "skip"; reason: "no_content" | "not_receipt_like" | "everyday_sender" | "utility_bill" | "carrier" | "low_score" };

/** Minimum body length worth sending to the AI. */
const MIN_BODY_TEXT_LENGTH = 80;
/** Upper bound of body text sent to the AI (cost guard). */
export const MAX_BODY_TEXT_LENGTH = 20_000;

/**
 * Decide how to import one email:
 * - any PDF attachment → import the PDFs (unchanged behaviour);
 * - otherwise, if sender/subject look like an order or receipt and there is a
 *   usable body → send the body text to the AI;
 * - otherwise skip.
 */
export function planMessageImport(message: MailMessage, options: ListingOptions = {}): MessageImportPlan {
  // Groceries, utilities, telecoms and other recurring bills never reach the
  // AI, even with a PDF attached (e.g. an EDP or Continente invoice), unless
  // the user set that supplier to import automatically.
  const listing = scoreReceiptListing({ ...message, hasAttachments: message.pdfAttachments.length > 0 }, options);
  if (listing.reason === "everyday_sender" || listing.reason === "utility_bill") {
    return { kind: "skip", reason: listing.reason };
  }
  if (message.pdfAttachments.length > 0) {
    return { kind: "pdf", attachments: message.pdfAttachments };
  }
  if (!listing.include) {
    // No PDF: the email body only goes to the AI when the listing rules pass.
    return { kind: "skip", reason: listing.reason === "ok" ? "low_score" : listing.reason };
  }
  const bodyText = message.html
    ? htmlToText(message.html)
    : normalizeWhitespace(message.text ?? "");
  if (bodyText.length < MIN_BODY_TEXT_LENGTH) {
    return { kind: "skip", reason: "no_content" };
  }
  return { kind: "html", text: bodyText.slice(0, MAX_BODY_TEXT_LENGTH) };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  euro: "€", pound: "£", copy: "©", reg: "®", trade: "™",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  agrave: "à", Agrave: "À", ccedil: "ç", Ccedil: "Ç",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  ntilde: "ñ", Ntilde: "Ñ",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return " ";
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v\u00a0\u200b\u200c\u200d\ufeff]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Convert an HTML email body to readable plain text without external
 * dependencies. Drops scripts, styles, comments and hidden preheaders; keeps
 * table rows and cells on separate lines/columns so line items stay legible.
 */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(div|span|p|td|table)\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|header|footer|blockquote)\s*>/gi, "\n")
    .replace(/<(td|th)\b[^>]*>/gi, " \t ")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<img\b[^>]*\balt\s*=\s*"([^"]*)"[^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  return normalizeWhitespace(text.replace(/\t/g, " "));
}
