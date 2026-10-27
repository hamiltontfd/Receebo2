import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const objectStorageService = new ObjectStorageService();

export type ExtractedProduct = {
  name: string;
  quantity: number | null;
  price: number | null;
};

export type ExtractedNotableItem = {
  name: string;
  price: number | null;
  category: string | null;
  reason: string;
};

export type ExtractedReceipt = {
  isReceipt: boolean;
  merchant: string | null;
  purchaseDate: string | null;
  total: number | null;
  currency: string | null;
  category: string | null;
  summary: string | null;
  ocrText: string | null;
  warranty: string | null;
  transactionNumber: string | null;
  products: ExtractedProduct[];
  notableItems: ExtractedNotableItem[];
  purchaseCountry: string | null;
  isOnlinePurchase: boolean | null;
  /** Date the goods were actually delivered, when the document states it (YYYY-MM-DD). */
  deliveryDate: string | null;
};

const CANONICAL_CATEGORIES = ["Electronics", "Home", "Clothing & Apparel", "Groceries", "Other"] as const;

function normalizeCategory(value: string | null): string {
  if (value && (CANONICAL_CATEGORIES as readonly string[]).includes(value)) return value;
  return "Other";
}

const SYSTEM_PROMPT = `You are an expert receipt and invoice analyst. You are given an image or PDF. First determine whether the image actually shows a purchase receipt, invoice, or proof of purchase. If it does not (e.g. it is a selfie, landscape photo, document, screenshot of something unrelated, or any non-purchase document), set "isReceipt" to false and leave all other fields as null or empty.

Respond ONLY with a JSON object matching this exact shape:
{
  "isReceipt": boolean,             // true if the image contains a purchase receipt, invoice, or proof of purchase; false otherwise
  "merchant": string | null,        // store / company / vendor name
  "purchaseDate": string | null,    // the purchase date in strict YYYY-MM-DD format, or null if not present. For invoices and bills use the ISSUE date (invoice date, "data de emissão", "data da fatura"), NEVER the due date ("data limite de pagamento", "data de vencimento", "pagar até", "due date")
  "total": number | null,           // the grand total amount actually paid, as a plain number (no currency symbol)
  "currency": string | null,        // ISO currency code such as "EUR", "USD", "GBP" if determinable, else null
  "category": string | null,        // must be exactly one of: "Electronics", "Home", "Clothing & Apparel", "Groceries", "Other"
  "summary": string | null,         // one or two natural sentences summarizing what was bought and the context
  "ocrText": string | null,         // the full raw text content transcribed from the receipt, preserving line breaks
  "warranty": string | null,        // warranty or return-policy information printed on the receipt (e.g. "2-year manufacturer warranty", "30-day returns"), or null if none is mentioned
  "transactionNumber": string | null, // the transaction/receipt/confirmation number printed on the receipt (e.g. "TXN-4821039", "#00123456", "Order #123"), or null if not present
  "purchaseCountry": string | null,   // ISO-3166-1 alpha-2 country code where the purchase was made (e.g. "PT", "US", "BR", "DE"), inferred from currency, merchant name, address, language, or domain. null if not determinable.
  "isOnlinePurchase": boolean | null, // true if this is an e-commerce / online / distance purchase (order confirmation, Amazon, web store, delivery receipt, etc.); false if in-store; null if unclear.
  "deliveryDate": string | null,    // the date the goods were actually DELIVERED ("delivered on", "entregue em", "data de entrega" of a completed delivery) in strict YYYY-MM-DD format. null if not stated, or if only an estimated/expected delivery date is shown ("arrives by", "previsão de entrega", "entrega prevista").
  "products": [                      // individual line items; empty array if none are legible
    { "name": string, "quantity": number | null, "price": number | null }
  ],
  "notableItems": [                  // items worth keeping the receipt for; empty array if none qualify
    {
      "name": string,                // concise human-readable product name (see naming rules below)
      "price": number | null,        // item price as a plain number, or null if not visible
      "category": string | null,     // inferred category, e.g. "Electronics", "Appliances", "Tools", "Furniture"
      "reason": string               // one-line reason, e.g. "likely has manufacturer warranty", "eligible for return", "high-value purchase"
    }
  ]
}

Rules:
- Set "isReceipt" to false for any image that is not a purchase receipt, invoice, or proof of purchase. When false, all other fields should be null or empty arrays.
- Use null for any field you genuinely cannot determine. Do not invent values.
- purchaseDate: when a document shows several dates, prefer the transaction/order/issue date. A payment due date, billing period end or delivery date is never the purchase date.
- "total" and "price" must be numbers (e.g. 12.99), never strings, and must not include currency symbols.
- Transcribe ocrText faithfully, including item lines, taxes, and totals.
- Do not include any commentary outside the JSON.
- For notableItems: include any line item priced above ~$50 that falls into a durable-goods category such as electronics, appliances, tools, furniture, sporting equipment, or similar. These are purchases where a receipt may be needed for warranty claims, returns, or insurance. Exclude consumables (food, drinks, toiletries), services, and low-value items regardless of category.
- Deduplication: if the same line item (identical name and price) appears more than once in the image — for example because two overlapping receipt segments were photographed — include it only ONCE in the products array. Do not repeat identical line items.
- Product naming — apply to BOTH "products[].name" AND "notableItems[].name":
  * Write a concise, human-readable name: brand + model identifier + product type. Target 2–6 words; hard cap 60 characters.
  * Strip all of the following: compatibility lists ("for iPhone, Android, iOS 16+…"), colour/finish suffixes ("Space Gray", "RGB", "White"), certification badges ("MFi Certified", "Works with Alexa", "Energy Star"), internal SKU or part codes that mean nothing to a consumer, and SEO keyword padding that online retailers append for search ranking.
  * Keep the brand name when present. Keep a model name or series only when it is short and meaningful to the buyer (e.g. "Galaxy S24", "AirPods Pro", "MX Master 3S"). Drop purely internal catalogue codes.
  * Transformation examples:
    - "GameSir X2s Mobile Gaming Controller for iPhone Android MFi Certified Plug-and-Play Ergonomic Gamepad Hall Effect Joysticks Compatible iOS 16+ Android 10+ White" → "GameSir X2s Mobile Gaming Controller"
    - "Instant Pot Duo 7-in-1 Electric Pressure Cooker, 6 Quart, 14 One-Touch Programs, Stainless Steel/Black" → "Instant Pot Duo 6qt Pressure Cooker"
    - "Logitech MX Master 3S Performance Wireless Mouse Ultra-Fast Scrolling Ergo 8K DPI Track on Glass Quiet Clicks USB-C Bluetooth Windows Linux Chrome – Pale Gray" → "Logitech MX Master 3S Mouse"
    - "Apple AirPods Pro (2nd Generation) Wireless Earbuds, Up to 2X More Active Noise Cancelling, Adaptive Transparency, Personalized Spatial Audio, MagSafe Charging Case, Bluetooth Headphones for iPhone" → "Apple AirPods Pro 2nd Gen"
  * The full original text is preserved verbatim in "ocrText", so shortening the name here loses no information.`;

const PRE_CHECK_SYSTEM_PROMPT = `You are a document classifier. Respond ONLY with a JSON object {"isReceipt":true} if the image shows a purchase receipt, invoice, or proof of purchase from a store or service provider. Respond with {"isReceipt":false} for anything else (photos, selfies, random documents, screenshots, menus, etc.). A valid receipt must show at least a merchant name, items purchased, and a total or subtotal amount.`;

export async function checkIsReceipt(
  objectPath: string,
  contentType: string,
): Promise<boolean> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();
  const base64 = buffer.toString("base64");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 30,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PRE_CHECK_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Is this a purchase receipt?" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            buildContentPart(base64, contentType) as any,
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { isReceipt?: unknown };
    // Require an explicit true — any other value (false, missing, malformed) rejects
    return parsed.isReceipt === true;
  } catch (error) {
    logger.warn({ error }, "Pre-check failed, falling through to full extraction");
    return true;
  }
}

function buildContentPart(base64: string, contentType: string) {
  if (contentType === "application/pdf") {
    return {
      type: "file" as const,
      file: {
        filename: "receipt.pdf",
        file_data: `data:application/pdf;base64,${base64}`,
      },
    };
  }
  return {
    type: "image_url" as const,
    image_url: { url: `data:${contentType};base64,${base64}` },
  };
}

export async function extractReceiptData(
  objectPath: string,
  contentType: string,
): Promise<ExtractedReceipt> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();
  const base64 = buffer.toString("base64");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the structured receipt data from this file.",
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          buildContentPart(base64, contentType) as any,
        ],
      },
    ],
  });

  return parseExtraction(completion.choices[0]?.message?.content ?? "{}");
}

/** "YYYY-MM-DD" (or any parseable date) -> "YYYY-MM-DD"; null when missing or invalid. */
export function toIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()) ? null : text;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseExtraction(raw: string): ExtractedReceipt {
  let parsed: Partial<ExtractedReceipt> = {};
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger.error({ error, raw }, "Failed to parse AI receipt extraction JSON");
    throw new Error("AI returned malformed JSON");
  }

  const toNumberOrNull = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const toStringOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

  const products: ExtractedProduct[] = Array.isArray(parsed.products)
    ? parsed.products
        .filter((p) => p && typeof p === "object")
        .map((p) => ({
          name: toStringOrNull((p as ExtractedProduct).name) ?? "Item",
          quantity: toNumberOrNull((p as ExtractedProduct).quantity),
          price: toNumberOrNull((p as ExtractedProduct).price),
        }))
    : [];

  const notableItems: ExtractedNotableItem[] = Array.isArray(
    (parsed as Partial<ExtractedReceipt>).notableItems,
  )
    ? ((parsed as Partial<ExtractedReceipt>).notableItems as ExtractedNotableItem[])
        .filter((n) => n && typeof n === "object")
        .map((n) => ({
          name: toStringOrNull(n.name) ?? "Item",
          price: toNumberOrNull(n.price),
          category: toStringOrNull(n.category),
          reason: toStringOrNull(n.reason) ?? "worth keeping",
        }))
    : [];

  const purchaseDate = toIsoDateOrNull(parsed.purchaseDate);
  let deliveryDate = toIsoDateOrNull((parsed as Partial<ExtractedReceipt>).deliveryDate);
  // Goods can't arrive before they were bought.
  if (deliveryDate && purchaseDate && deliveryDate < purchaseDate) deliveryDate = null;

  const isReceipt = typeof parsed.isReceipt === "boolean" ? parsed.isReceipt : true;

  const purchaseCountryRaw = toStringOrNull((parsed as ExtractedReceipt).purchaseCountry);
  const purchaseCountry =
    purchaseCountryRaw && /^[A-Za-z]{2}$/.test(purchaseCountryRaw)
      ? purchaseCountryRaw.toUpperCase()
      : null;

  const isOnlinePurchaseRaw = (parsed as ExtractedReceipt).isOnlinePurchase;
  const isOnlinePurchase =
    typeof isOnlinePurchaseRaw === "boolean" ? isOnlinePurchaseRaw : null;

  return {
    isReceipt,
    merchant: toStringOrNull(parsed.merchant),
    purchaseDate,
    total: toNumberOrNull(parsed.total),
    currency: toStringOrNull(parsed.currency),
    category: normalizeCategory(toStringOrNull(parsed.category)),
    summary: toStringOrNull(parsed.summary),
    ocrText: toStringOrNull(parsed.ocrText),
    warranty: toStringOrNull(parsed.warranty),
    transactionNumber: toStringOrNull((parsed as ExtractedReceipt).transactionNumber),
    products,
    notableItems,
    purchaseCountry,
    isOnlinePurchase,
    deliveryDate,
  };
}

const TEXT_EMAIL_INSTRUCTIONS = `The input is the plain-text body of an email (converted from HTML), not an image. Treat it exactly like a receipt file: decide whether it is a purchase receipt, order confirmation with prices, or invoice. Marketing emails, newsletters, shipping updates without prices, account notices, or promotions are NOT receipts: set "isReceipt" to false. For "ocrText", copy the relevant order/receipt text from the email (not boilerplate footers).`;

/**
 * Extract receipt data from email text (HTML-body imports). Uses the same
 * prompt, normalisation and non-receipt rejection as file extraction.
 */
export async function extractReceiptDataFromText(
  text: string,
  meta: { subject?: string | null; from?: string | null; receivedAt?: string | null } = {},
): Promise<ExtractedReceipt> {
  const header = [
    meta.from ? `From: ${meta.from}` : null,
    meta.subject ? `Subject: ${meta.subject}` : null,
    meta.receivedAt ? `Received: ${meta.receivedAt}` : null,
  ].filter(Boolean).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${TEXT_EMAIL_INSTRUCTIONS}` },
      {
        role: "user",
        content: `Extract the structured receipt data from this email.\n\n${header}\n\n${text}`,
      },
    ],
  });

  return parseExtraction(completion.choices[0]?.message?.content ?? "{}");
}
