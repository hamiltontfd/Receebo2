import { and, getTableColumns, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, receiptsTable, type Receipt } from "@workspace/db";
import { receiptListOrder } from "./receiptOrder";

/**
 * Receipt search with partly encrypted content (docs/data-encryption.md).
 *
 * merchant, category, original_file_name and currency stay plaintext and are
 * matched in SQL with ILIKE exactly as before. summary, ocr_text, products and
 * notable_items are matched in SQL only while a row still holds them in
 * plaintext; a row holding any of them encrypted is a candidate, decrypted on
 * read and matched in memory with the same ILIKE semantics. Order and the
 * 10 000 cap are unchanged (the cap now counts candidates, not matches).
 */
// Same prefix as FIELD_ENVELOPE_PREFIX in @workspace/db (kept literal so the
// module loads with a mocked db). Built lazily for the same reason.
const ENC_LIKE = "enc:v1:%";
const encrypted = () => ({
  summary: sql`(${receiptsTable.summary} IS NOT NULL AND ${receiptsTable.summary} LIKE ${ENC_LIKE})`,
  ocrText: sql`(${receiptsTable.ocrText} IS NOT NULL AND ${receiptsTable.ocrText} LIKE ${ENC_LIKE})`,
  products: sql`(jsonb_typeof(${receiptsTable.products}) = 'string')`,
  notableItems: sql`(jsonb_typeof(${receiptsTable.notableItems}) = 'string')`,
});

function plainMatch(q: string): SQL {
  const enc = encrypted();
  const term = `%${q}%`;
  return or(
    ilike(receiptsTable.merchant, term),
    ilike(receiptsTable.category, term),
    sql`(NOT ${enc.summary} AND ${receiptsTable.summary} ILIKE ${term})`,
    sql`(NOT ${enc.ocrText} AND ${receiptsTable.ocrText} ILIKE ${term})`,
    ilike(receiptsTable.originalFileName, term),
    ilike(receiptsTable.currency, term),
    sql`(NOT ${enc.products} AND ${receiptsTable.products}::text ILIKE ${term})`,
    sql`(NOT ${enc.notableItems} AND ${receiptsTable.notableItems}::text ILIKE ${term})`,
  )!;
}

/** WHERE condition: a plaintext match, or a row with encrypted content to check in memory. */
export function receiptSearchCondition(q: string): SQL {
  const enc = encrypted();
  return or(plainMatch(q), enc.summary, enc.ocrText, enc.products, enc.notableItems)!;
}

/** PostgreSQL ILIKE (default escape `\`) as a JS RegExp. */
export function ilikeRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\" && i + 1 < pattern.length) { out += escapeRe(pattern[++i]!); continue; }
    if (c === "%") out += "[\\s\\S]*";
    else if (c === "_") out += "[\\s\\S]";
    else out += escapeRe(c);
  }
  return new RegExp(`^${out}$`, "iu");
}
function escapeRe(c: string): string { return c.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&"); }

/** Close to PostgreSQL's jsonb::text output (", " and ": " separators, keys by length then bytes). */
export function jsonbText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(", ")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as object).filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
    return `{${keys.map((k) => `${JSON.stringify(k)}: ${jsonbText((value as Record<string, unknown>)[k])}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

type Flags = { sqlMatch: boolean; encSummary: boolean; encOcr: boolean; encProducts: boolean; encNotable: boolean };

export function memoryMatch(row: Pick<Receipt, "summary" | "ocrText" | "products" | "notableItems">, flags: Flags, q: string): boolean {
  if (flags.sqlMatch) return true;
  const re = ilikeRegExp(`%${q}%`);
  return (flags.encSummary && row.summary != null && re.test(row.summary)) ||
    (flags.encOcr && row.ocrText != null && re.test(row.ocrText)) ||
    (flags.encProducts && re.test(jsonbText(row.products))) ||
    (flags.encNotable && re.test(jsonbText(row.notableItems)));
}

export async function searchReceipts(q: string, conditions: SQL[], limit: number): Promise<Receipt[]> {
  const enc = encrypted();
  const rows = await db
    .select({
      ...getTableColumns(receiptsTable),
      sqlMatch: sql<boolean>`${plainMatch(q)}`.as("search_sql_match"),
      encSummary: sql<boolean>`${enc.summary}`.as("search_enc_summary"),
      encOcr: sql<boolean>`${enc.ocrText}`.as("search_enc_ocr"),
      encProducts: sql<boolean>`${enc.products}`.as("search_enc_products"),
      encNotable: sql<boolean>`${enc.notableItems}`.as("search_enc_notable"),
    })
    .from(receiptsTable)
    .where(and(...conditions))
    .orderBy(...receiptListOrder)
    .limit(limit);
  const out: Receipt[] = [];
  for (const { sqlMatch, encSummary, encOcr, encProducts, encNotable, ...receipt } of rows) {
    if (memoryMatch(receipt, { sqlMatch: !!sqlMatch, encSummary: !!encSummary, encOcr: !!encOcr, encProducts: !!encProducts, encNotable: !!encNotable }, q)) {
      out.push(receipt);
    }
  }
  return out;
}
