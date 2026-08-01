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
  "purchaseDate": string | null,    // the purchase date in strict YYYY-MM-DD format, or null if not present
  "total": number | null,           // the grand total amount actually paid, as a plain number (no currency symbol)
  "currency": string | null,        // ISO currency code such as "EUR", "USD", "GBP" if determinable, else null
  "category": string | null,        // must be exactly one of: "Electronics", "Home", "Clothing & Apparel", "Groceries", "Other"
  "summary": string | null,         // one or two natural sentences summarizing what was bought and the context
  "ocrText": string | null,         // the full raw text content transcribed from the receipt, preserving line breaks
  "warranty": string | null,        // warranty or return-policy information printed on the receipt (e.g. "2-year manufacturer warranty", "30-day returns"), or null if none is mentioned
  "transactionNumber": string | null, // the transaction/receipt/confirmation number printed on the receipt (e.g. "TXN-4821039", "#00123456", "Order #123"), or null if not present
  "purchaseCountry": string | null,   // ISO-3166-1 alpha-2 country code where the purchase was made (e.g. "PT", "US", "BR", "DE"), inferred from currency, merchant name, address, language, or domain. null if not determinable.
  "isOnlinePurchase": boolean | null, // true if this is an e-commerce / online / distance purchase (order confirmation, Amazon, web store, delivery receipt, etc.); false if in-store; null if unclear.
  "products": [                      // individual line items; empty array if none are legible
    { "name": string, "quantity": number | null, "price": number | null }
  ],
  "notableItems": [                  // items worth keeping the receipt for; empty array if none qualify
    {
      "name": string,                // product name as it appears on the receipt
      "price": number | null,        // item price as a plain number, or null if not visible
      "category": string | null,     // inferred category, e.g. "Electronics", "Appliances", "Tools", "Furniture"
      "reason": string               // one-line reason, e.g. "likely has manufacturer warranty", "eligible for return", "high-value purchase"
    }
  ]
}

Rules:
- Set "isReceipt" to false for any image that is not a purchase receipt, invoice, or proof of purchase. When false, all other fields should be null or empty arrays.
- Use null for any field you genuinely cannot determine. Do not invent values.
- "total" and "price" must be numbers (e.g. 12.99), never strings, and must not include currency symbols.
- Transcribe ocrText faithfully, including item lines, taxes, and totals.
- Do not include any commentary outside the JSON.
- For notableItems: include any line item priced above ~$50 that falls into a durable-goods category such as electronics, appliances, tools, furniture, sporting equipment, or similar. These are purchases where a receipt may be needed for warranty claims, returns, or insurance. Exclude consumables (food, drinks, toiletries), services, and low-value items regardless of category.
- Deduplication: if the same line item (identical name and price) appears more than once in the image — for example because two overlapping receipt segments were photographed — include it only ONCE in the products array. Do not repeat identical line items.`;

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

  const raw = completion.choices[0]?.message?.content ?? "{}";
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

  let purchaseDate = toStringOrNull(parsed.purchaseDate);
  if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    const d = new Date(purchaseDate);
    purchaseDate = Number.isNaN(d.getTime())
      ? null
      : d.toISOString().slice(0, 10);
  }

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
  };
}
