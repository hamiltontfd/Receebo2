import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const objectStorageService = new ObjectStorageService();

export type ExtractedProduct = {
  name: string;
  quantity: number | null;
  price: number | null;
};

export type ExtractedReceipt = {
  merchant: string | null;
  purchaseDate: string | null;
  total: number | null;
  currency: string | null;
  category: string | null;
  summary: string | null;
  ocrText: string | null;
  products: ExtractedProduct[];
};

const SYSTEM_PROMPT = `You are an expert receipt and invoice analyst. You are given an image or PDF of a purchase receipt or invoice. Read it carefully and extract structured information.

Respond ONLY with a JSON object matching this exact shape:
{
  "merchant": string | null,        // store / company / vendor name
  "purchaseDate": string | null,    // the purchase date in strict YYYY-MM-DD format, or null if not present
  "total": number | null,           // the grand total amount actually paid, as a plain number (no currency symbol)
  "currency": string | null,        // ISO currency code such as "EUR", "USD", "GBP" if determinable, else null
  "category": string | null,        // a concise spending category, e.g. "Groceries", "Dining", "Electronics", "Transport", "Utilities", "Office Supplies", "Healthcare", "Other"
  "summary": string | null,         // one or two natural sentences summarizing what was bought and the context
  "ocrText": string | null,         // the full raw text content transcribed from the receipt, preserving line breaks
  "products": [                      // individual line items; empty array if none are legible
    { "name": string, "quantity": number | null, "price": number | null }
  ]
}

Rules:
- Use null for any field you genuinely cannot determine. Do not invent values.
- "total" and "price" must be numbers (e.g. 12.99), never strings, and must not include currency symbols.
- Transcribe ocrText faithfully, including item lines, taxes, and totals.
- Do not include any commentary outside the JSON.`;

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

  let purchaseDate = toStringOrNull(parsed.purchaseDate);
  if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    const d = new Date(purchaseDate);
    purchaseDate = Number.isNaN(d.getTime())
      ? null
      : d.toISOString().slice(0, 10);
  }

  return {
    merchant: toStringOrNull(parsed.merchant),
    purchaseDate,
    total: toNumberOrNull(parsed.total),
    currency: toStringOrNull(parsed.currency),
    category: toStringOrNull(parsed.category),
    summary: toStringOrNull(parsed.summary),
    ocrText: toStringOrNull(parsed.ocrText),
    products,
  };
}
