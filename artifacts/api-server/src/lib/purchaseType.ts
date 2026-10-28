/**
 * What kind of purchase a receipt is, and whether consumer-rights dates apply.
 *
 * Hamilton, 28 Oct 2026: subscriptions (iCloud+, Apple One, "Renews ..."),
 * one-off digital purchases (an App Store app, a film, an in-app purchase) and
 * event tickets get NO return window and NO warranty dates, so no reminders
 * of either kind (email or push). Services follow the proposal: no dates.
 *
 * Precedence: manual choice > AI (purchaseType) > deterministic hints > null.
 * null (old receipts, unknown) keeps today's behaviour. Hints only fill a
 * missing value; they never override the AI or a manual choice, and they
 * only fire on strong signals.
 */

export const PURCHASE_TYPES = ["goods", "subscription", "digital", "service", "ticket"] as const;
export type PurchaseType = (typeof PURCHASE_TYPES)[number];
export const PURCHASE_TYPE_SOURCES = ["ai", "hint", "manual"] as const;
export type PurchaseTypeSource = (typeof PURCHASE_TYPE_SOURCES)[number];

export function normalizePurchaseType(value: unknown): PurchaseType | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if ((PURCHASE_TYPES as readonly string[]).includes(v)) return v as PurchaseType;
  // Tolerate close synonyms from the model.
  if (v === "product" || v === "physical" || v === "goods/product") return "goods";
  if (v === "digital_content" || v === "digital content" || v === "app" || v === "in-app purchase") return "digital";
  if (v === "event" || v === "event ticket" || v === "tickets") return "ticket";
  return null;
}

/** True when the purchase gets no return window, no warranty dates and no reminders. */
export function hasNoConsumerDates(type: string | null | undefined): boolean {
  const t = normalizePurchaseType(type);
  return t !== null && t !== "goods";
}

export interface PurchaseTypeHintInput {
  merchant?: string | null;
  category?: string | null;
  summary?: string | null;
  ocrText?: string | null;
  products?: ReadonlyArray<{ name?: string | null }> | null;
  /** Email sender and subject, only known while importing. */
  from?: string | null;
  subject?: string | null;
}

// Subscription products (named services that only exist as subscriptions).
const SUBSCRIPTION_PRODUCTS =
  /\b(icloud\+|icloud storage|apple one|apple music|apple tv\+|apple arcade|apple news\+|apple fitness\+|spotify premium|netflix|disney\+|disney plus|hbo max|max subscription|youtube premium|youtube music premium|google one|microsoft 365|office 365|xbox game pass|playstation plus|ps plus|nintendo switch online|adobe creative cloud|creative cloud|chatgpt plus|chatgpt pro|claude pro|dropbox plus)(?!\w)/i;
// Renewal wording on the receipt itself.
const RENEWAL_WORDS =
  /\b(renews|renewal date|auto-?renew(s|al)?|renova(?:-se)? (?:a|em)|renovação automática|renova automaticamente|subscription renews|next billing date|próxima cobrança|próxima faturação|billed (?:monthly|annually|yearly)|monthly plan|annual plan|plano (?:mensal|anual)|free trial ends|o período experimental termina)\b/i;
// One-off digital stores (apps, films, books, in-app purchases).
const DIGITAL_STORE =
  /\b(app store|apple books|itunes store|apple tv app|google play|steam purchase|steam store|playstation store|nintendo eshop|in-app purchase|compra (?:integrada|na app)|kindle edition|kindle ebook)\b/i;
// Apple's digital receipts come from email.apple.com; hardware orders from orders.apple.com.
const APPLE_DIGITAL_SENDER = /@email\.apple\.com\b/i;
// Ticket sellers and wording (only with the Entertainment category or a seller name).
const TICKET_SELLERS =
  /\b(ticketline|bol\.pt|blueticket|ticketmaster|eventbrite|see tickets|seetickets|fever(?:up)?|dice\.fm|uci cinemas|nos cinemas|cinema city|cinemas nos)\b/i;
const TICKET_WORDS = /\b(e-?tickets?|bilhetes?|ingressos?|entradas?|admission|lugar|seat|plateia|bancada)\b/i;

/** Merchant, summary and line items: what was bought, without email footers. */
function shortTextOf(input: PurchaseTypeHintInput): string {
  const products = (input.products ?? []).map((p) => p?.name ?? "").join("\n");
  return [input.merchant, input.summary, products].filter(Boolean).join("\n");
}

/**
 * Deterministic purchase type from strong signals only, or null.
 * Never returns "goods": a hint can only take dates away, never decide that
 * something is a product.
 */
export function purchaseTypeHint(input: PurchaseTypeHintInput): Exclude<PurchaseType, "goods" | "service"> | null {
  // Product and store names are matched on what was bought only: store
  // emails often carry "Get it on Google Play" badges or streaming ads.
  const short = shortTextOf(input);
  const full = `${short}\n${input.ocrText ?? ""}`;
  if (SUBSCRIPTION_PRODUCTS.test(short) || RENEWAL_WORDS.test(full)) return "subscription";
  if (DIGITAL_STORE.test(short)) return "digital";
  // "Your receipt from Apple" (email.apple.com) is App Store / iTunes; Apple
  // hardware orders come from orders.apple.com and keep their dates.
  if (input.from && APPLE_DIGITAL_SENDER.test(input.from) &&
      /^\s*(your receipt from apple|o seu recibo da apple|seu recibo da apple)\.?\s*$/i.test(input.subject ?? "")) {
    return "digital";
  }
  if (TICKET_SELLERS.test(input.merchant ?? "")) return "ticket";
  if (input.category === "Entertainment" && TICKET_WORDS.test(short)) return "ticket";
  return null;
}

/** Final type and where it came from: AI > hints > null. */
export function resolvePurchaseType(
  aiType: unknown,
  hintInput: PurchaseTypeHintInput,
): { purchaseType: PurchaseType | null; purchaseTypeSource: PurchaseTypeSource | null } {
  const ai = normalizePurchaseType(aiType);
  if (ai) return { purchaseType: ai, purchaseTypeSource: "ai" };
  const hint = purchaseTypeHint(hintInput);
  if (hint) return { purchaseType: hint, purchaseTypeSource: "hint" };
  return { purchaseType: null, purchaseTypeSource: null };
}
