import type { MailMessage } from "./types";

/**
 * Heuristics that decide which emails are worth sending to the AI extractor.
 * The AI still rejects non-receipts (isReceipt=false); these rules only keep
 * cost and noise down.
 */

// Subject keywords (EN, PT, ES, FR, DE, IT) for orders, receipts and invoices.
const SUBJECT_PATTERN = new RegExp(
  [
    "receipt", "invoice", "order", "your purchase", "purchase confirmation",
    "payment confirmation", "payment received", "confirmation", "shipped", "dispatched",
    "recibo", "fatura", "factura", "encomenda", "pedido", "compra",
    "comprovativo", "confirmação", "confirmacao", "confirmación",
    "commande", "facture", "reçu",
    "rechnung", "bestellung", "quittung", "beleg",
    "ordine", "ricevuta", "fattura",
  ]
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "i",
);

// Sender local-parts / domains that typically send orders and receipts.
const SENDER_PATTERN =
  /(auto-confirm|order-update|orders?|receipts?|invoices?|billing|faturas?|faturacao|encomendas?|pedidos?|shipment-tracking|confirm(ation)?|purchases?)@|@(.+\.)?(amazon\.[a-z.]+|apple\.com|paypal\.[a-z.]+|aliexpress\.com|ebay\.[a-z.]+|zalando\.[a-z.]+|ikea\.com|fnac\.pt|worten\.pt|continente\.pt|pccomponentes\.(pt|com)|decathlon\.[a-z.]+|leroymerlin\.pt|temu\.com|shein\.com)\b/i;

// Things that look like receipts by keyword but are almost never purchases.
const EXCLUDE_SUBJECT_PATTERN =
  /(newsletter|unsubscribe|webinar|password reset|verify your (email|account)|security alert|sign-?in|log-?in attempt|meeting|calendar|invitation)/i;

export function looksLikeReceiptEmail(input: {
  subject: string | null;
  from: string | null;
}): boolean {
  const subject = input.subject ?? "";
  const from = input.from ?? "";
  if (subject && EXCLUDE_SUBJECT_PATTERN.test(subject)) return false;
  return SUBJECT_PATTERN.test(subject) || SENDER_PATTERN.test(from);
}

/** Cheap pre-filter on list results (subject + sender only). */
export function isLikelyReceiptListing(input: {
  subject: string | null;
  from: string | null;
  hasAttachments?: boolean;
}): boolean {
  return looksLikeReceiptEmail(input);
}

export type MessageImportPlan =
  | { kind: "pdf"; attachments: MailMessage["pdfAttachments"] }
  | { kind: "html"; text: string }
  | { kind: "skip"; reason: "no_content" | "not_receipt_like" };

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
export function planMessageImport(message: MailMessage): MessageImportPlan {
  if (message.pdfAttachments.length > 0) {
    return { kind: "pdf", attachments: message.pdfAttachments };
  }
  if (!looksLikeReceiptEmail(message)) {
    return { kind: "skip", reason: "not_receipt_like" };
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
