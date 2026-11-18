import { randomBytes } from "crypto";
import { isOnlineForConsumerRights, isReceiptWarrantyTextScoped, parseReceiptReturnDays } from "@workspace/api-zod";
import { CANONICAL_CATEGORIES, type CanonicalCategory } from "./categories";
import { hasNoConsumerDates } from "./purchaseType";
import { detectCountry, returnWindowStart } from "./returnWindowCalc";
import { resolvePurchaseCountry } from "./purchaseCountry";
import { addDaysIso, usReturnStart, usStoreReturnWindow } from "./usStorePolicies";
import { addMonthsClamped, addYearsClamped, isIsoDate, parseManufacturerWarrantyMonths } from "./warrantyExpiry";
import type { ReceiptProductItem } from "@workspace/db";

/**
 * Per-line return and warranty facts. Receipt-level warranty text, returnDays
 * and the reminder columns are not copied onto lines. Rules are computed on
 * read and are never stored as if the document or the user had stated them.
 *
 * A line with no stored coverage and no rule that can run stays unknown.
 * Unknown is not "no coverage".
 */

export type WarrantyType = "legal" | "manufacturer" | "commercial";
export type CoverageBasis = "stated" | "user" | "rule";
export type CoverageCertainty = "confirmed" | "estimated" | "unknown";
export type CoverageStatus = "open" | "expired" | "unknown" | "not_applicable";

export interface StoredCoverage {
  id: string;
  kind: "return" | "warranty";
  warrantyType: WarrantyType | null;
  basis: "stated" | "user";
  certainty: "confirmed" | "estimated";
  lengthDays: number | null;
  lengthMonths: number | null;
  /** Only when the document or the user gave a date. A length is not turned into a date here. */
  endDate: string | null;
  evidence: string | null;
  source: "extraction" | "user";
}

export interface ItemContract {
  id: string;
  kind: "return" | "warranty";
  warrantyType: WarrantyType | null;
  basis: CoverageBasis;
  certainty: CoverageCertainty;
  status: CoverageStatus;
  lengthDays: number | null;
  lengthMonths: number | null;
  startDate: string | null;
  endDate: string | null;
  ruleId: string | null;
  evidence: string | null;
  conflict: boolean;
  /** Brazil's complaint deadline is still waiting on legal review. Not a new rule. */
  legalReviewPending: boolean;
}

export interface ItemRights {
  lineId: string | null;
  index: number;
  contracts: ItemContract[];
}

export interface ItemRulesContext {
  /** Receipt category is a fallback, never a user-confirmed line classification. */
  category?: string | null;
  storeDomain?: string | null;
  savedCountry?: string | null;
  geoIpCountry?: string | null;
  deliveryCountry?: string | null;
  sellerCountry?: string | null;
  /** Account rules region. US uses the store table and no federal legal warranty. */
  region: "US" | "PT";
  purchaseDate?: string | null;
  deliveryDate?: string | null;
  purchaseCountry?: string | null;
  currency?: string | null;
  merchant?: string | null;
  isOnlinePurchase?: boolean | null;
  purchaseType?: string | null;
  /** Receipt-level stated fields are fallbacks only when a line has no same-kind coverage. */
  warranty?: string | null;
  returnDays?: number | null;
  /** YYYY-MM-DD. Defaults to today (UTC). */
  asOf?: string;
}

const LINE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const INJECTION = /ignore (all |any )?(previous|prior) instructions|system prompt|<\s*script|javascript:/i;

// Spain: RDL 7/2021, 27 April, TRLGDCU art. 120.1; effective 1 Jan 2022.
const LEGAL_WARRANTY_YEARS: Record<string, number> = { PT: 3, ES: 3, EU: 2 };
const DURABLE = new Set(["Electronics", "Home", "Clothing & Apparel", "Entertainment", "Other"]);
const ONLINE_RETURN_DAYS: Record<string, number> = { PT: 14, ES: 14, EU: 14, BR: 7, CA: 7 };

export function newLineId(): string {
  return `l_${randomBytes(8).toString("hex")}`;
}

export function newCoverageId(): string {
  return `c_${randomBytes(8).toString("hex")}`;
}

export function optionalLineCategory(value: unknown): CanonicalCategory | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const lower = value.trim().toLowerCase();
  return CANONICAL_CATEGORIES.find((c) => c.toLowerCase() === lower) ?? null;
}

function lineName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return text ? text.slice(0, 200) : null;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!text || text.length > max || INJECTION.test(text)) return null;
  return text;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function normSpace(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function evidenceAnchored(evidence: string, ocrText: string | null | undefined): boolean {
  if (!ocrText || !ocrText.trim()) return false;
  const quote = normSpace(evidence);
  const ocr = normSpace(ocrText);
  if (!quote || quote === ocr || quote.length > 240) return false;
  return ocr.includes(quote);
}

function evidenceMentions(kind: "return" | "warranty", evidence: string, length: boolean, endDate: string | null): boolean {
  const t = evidence.toLowerCase();
  if (kind === "return" && !/return|devolu|troca|prazo|days|dias/.test(t)) return false;
  if (kind === "warranty" && !/warrant|garantia|guarantee/.test(t)) return false;
  if (endDate && !t.includes(endDate)) return false;
  if (length && !/\d|one|two|three|five|um|dois|tr[eê]s|cinco|ano|year|month|m[eê]s|day|dia/.test(t)) return false;
  return true;
}

interface RawCoverage {
  id?: unknown;
  kind?: unknown;
  warrantyType?: unknown;
  lengthDays?: unknown;
  lengthMonths?: unknown;
  endDate?: unknown;
  evidence?: unknown;
}

function warrantyTypeOf(kind: "return" | "warranty", value: unknown): WarrantyType | null | undefined {
  if (kind === "return") return null;
  // Legal periods are computed from the existing rules. A quote or a save cannot confirm one.
  if (value === "manufacturer" || value === "commercial") return value;
  return undefined;
}

function buildCoverage(raw: RawCoverage, source: "extraction" | "user", ocrText: string | null | undefined, receiptWarranty: string | null | undefined): StoredCoverage | null {
  const kind = raw.kind === "return" || raw.kind === "warranty" ? raw.kind : null;
  if (!kind) return null;
  const warrantyType = warrantyTypeOf(kind, raw.warrantyType);
  if (warrantyType === undefined) return null;
  const lengthDays = clampInt(raw.lengthDays, 0, 365);
  const lengthMonths = clampInt(raw.lengthMonths, 1, 120);
  const endDate = typeof raw.endDate === "string" && isIsoDate(raw.endDate) ? raw.endDate : null;
  if (lengthDays == null && lengthMonths == null && !endDate) return null;
  const evidence = cleanText(raw.evidence, 240);
  if (source === "extraction") {
    if (!evidence) return null;
    if (receiptWarranty && normSpace(evidence) === normSpace(receiptWarranty)) return null;
    if (!evidenceAnchored(evidence, ocrText)) return null;
    if (!evidenceMentions(kind, evidence, lengthDays != null || lengthMonths != null, endDate)) return null;
  }
  const id = typeof raw.id === "string" && LINE_ID.test(raw.id) ? raw.id : newCoverageId();
  return {
    id,
    kind,
    warrantyType,
    basis: source === "user" ? "user" : "stated",
    certainty: source === "user" ? "confirmed" : "estimated",
    lengthDays,
    lengthMonths,
    endDate,
    evidence,
    source,
  };
}

const NAME_STOP = new Set(["the", "and", "for", "with", "from", "item", "de", "da", "do", "das", "dos"]);

function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((word) => word.length >= 2 && !NAME_STOP.has(word));
}

/** A quote in the OCR is not enough. It has to name this line and not another line. */
function evidenceNamesLine(evidence: string, name: string, otherNames: string[]): boolean {
  const text = evidence.toLowerCase();
  const mine = nameTokens(name).filter((token) => text.includes(token));
  if (mine.length === 0) return false;
  return !otherNames.some((other) => nameTokens(other).some((token) => text.includes(token)));
}

/** Identical stated coverages on more than one line were copied, not line-specific. */
function dropFanout(lines: Array<{ coverages: StoredCoverage[] }>): void {
  const groups = new Map<string, StoredCoverage[]>();
  for (const line of lines) {
    for (const coverage of line.coverages) {
      const key = JSON.stringify({
        kind: coverage.kind,
        warrantyType: coverage.warrantyType,
        lengthDays: coverage.lengthDays,
        lengthMonths: coverage.lengthMonths,
        endDate: coverage.endDate,
        evidence: coverage.evidence ? normSpace(coverage.evidence) : null,
      });
      const list = groups.get(key) ?? [];
      list.push(coverage);
      groups.set(key, list);
    }
  }
  const dropped = new Set<StoredCoverage>();
  for (const list of groups.values()) if (list.length > 1) list.forEach((c) => dropped.add(c));
  for (const line of lines) line.coverages = line.coverages.filter((c) => !dropped.has(c));
}

export interface ExtractedLineInput {
  name?: unknown;
  quantity?: unknown;
  price?: unknown;
  category?: unknown;
  statedCoverages?: unknown;
}

/**
 * New lines from extraction. Model-supplied ids are ignored. Stated coverages
 * survive only with their own quote in the OCR, and never by copying the
 * receipt warranty field onto every line.
 */
export function acceptExtractedLines(
  rawLines: unknown,
  opts: { ocrText?: string | null; receiptWarranty?: string | null },
): ReceiptProductItem[] {
  if (!Array.isArray(rawLines)) return [];
  const lines = rawLines.filter((line) => line && typeof line === "object").map((line) => {
    const raw = line as ExtractedLineInput;
    const name = lineName(raw.name) ?? "Item";
    const quantity = typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : null;
    const price = typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : null;
    const category = optionalLineCategory(raw.category);
    const stated = Array.isArray(raw.statedCoverages) ? raw.statedCoverages : [];
    const coverages = stated
      .map((item) => buildCoverage(item as RawCoverage, "extraction", opts.ocrText, opts.receiptWarranty))
      .filter((item): item is StoredCoverage => item !== null);
    return {
      lineId: newLineId(),
      name,
      quantity,
      price,
      category,
      categorySource: category ? "extraction" as const : null,
      coverages,
    };
  });
  dropFanout(lines);
  const names = lines.map((line) => line.name);
  for (let i = 0; i < lines.length; i++) {
    lines[i].coverages = lines[i].coverages.filter((coverage) => {
      if (!coverage.evidence) return false;
      return evidenceNamesLine(coverage.evidence, names[i], names.filter((_, j) => j !== i));
    });
  }
  return lines.map((line) => ({
    ...line,
    coverages: line.coverages.length > 0 ? line.coverages : undefined,
    category: line.category,
    categorySource: line.category ? "extraction" : null,
  }));
}

export interface IncomingLine {
  lineId?: string | null;
  name: string;
  quantity?: number | null;
  price?: number | null;
  category?: string | null;
  coverages?: RawCoverage[] | null;
}

/**
 * Full ordered list. Ids are kept across reorder. Coverages are replaced only
 * when the line includes the field. A stale client that omits every id cannot
 * wipe lines that already have one.
 */
export function mergeProductLines(
  existing: ReceiptProductItem[],
  incoming: IncomingLine[],
): { ok: true; products: ReceiptProductItem[] } | { ok: false; error: string } {
  const prior = new Map<string, ReceiptProductItem>();
  for (const line of existing) if (line.lineId && LINE_ID.test(line.lineId)) prior.set(line.lineId, line);
  const incomingHasId = incoming.some((line) => typeof line.lineId === "string" && line.lineId.length > 0);
  if (prior.size > 0 && !incomingHasId) {
    return { ok: false, error: "These lines already have ids. Send each lineId to edit them." };
  }
  const seen = new Set<string>();
  const products: ReceiptProductItem[] = [];
  for (const line of incoming) {
    const name = lineName(line.name);
    if (!name) return { ok: false, error: "Each line needs a name." };
    const requested = typeof line.lineId === "string" ? line.lineId.trim() : "";
    if (requested && !LINE_ID.test(requested)) return { ok: false, error: "A line id is not valid." };
    if (requested && seen.has(requested)) return { ok: false, error: "A line id is repeated." };
    const previous = requested ? prior.get(requested) : undefined;
    const lineId = requested && LINE_ID.test(requested) ? requested : newLineId();
    seen.add(lineId);
    const category = line.category === undefined ? previous?.category ?? null : optionalLineCategory(line.category);
    const categorySource = line.category === undefined
      ? previous?.categorySource ?? null
      : category ? "user" as const : null;
    let coverages = previous?.coverages;
    if (line.coverages !== undefined && line.coverages !== null) {
      const keptIds = new Set((previous?.coverages ?? []).map((c) => c.id));
      coverages = line.coverages
        .map((raw) => buildCoverage(
          { ...raw, id: typeof raw.id === "string" && keptIds.has(raw.id) ? raw.id : undefined },
          "user",
          null,
          null,
        ))
        .filter((item): item is StoredCoverage => item !== null);
    }
    products.push({
      lineId,
      name,
      quantity: line.quantity ?? null,
      price: line.price ?? null,
      category,
      categorySource,
      coverages: coverages && coverages.length > 0 ? coverages : undefined,
    });
  }
  return { ok: true, products };
}

function asOfDate(asOf?: string): string {
  if (asOf && isIsoDate(asOf)) return asOf;
  return new Date().toISOString().slice(0, 10);
}

function statusFor(endDate: string | null, asOf: string, fallback: CoverageStatus): CoverageStatus {
  if (!endDate) return fallback;
  return endDate < asOf ? "expired" : "open";
}

function statedContract(lineId: string, coverage: StoredCoverage, purchaseDate: string | null, asOf: string): ItemContract {
  const startDate = purchaseDate && isIsoDate(purchaseDate) ? purchaseDate : null;
  // A length is not a calendar date until the period has a start. No start, no date.
  if (!startDate) {
    return {
      id: coverage.id,
      kind: coverage.kind,
      warrantyType: coverage.warrantyType,
      basis: coverage.basis,
      certainty: coverage.certainty,
      status: "unknown",
      lengthDays: coverage.lengthDays,
      lengthMonths: coverage.lengthMonths,
      startDate: null,
      endDate: null,
      ruleId: null,
      evidence: coverage.evidence,
      conflict: false,
      legalReviewPending: false,
    };
  }
  let endDate = coverage.endDate;
  let conflict = false;
  if (coverage.lengthMonths) {
    const fromLength = addMonthsClamped(startDate, coverage.lengthMonths);
    if (endDate && fromLength !== endDate) conflict = true;
    else if (!endDate) endDate = fromLength;
  }
  if (!endDate && coverage.lengthDays != null) endDate = addDaysIso(startDate, coverage.lengthDays);
  const computed = !coverage.endDate && !!endDate;
  return {
    id: coverage.id,
    kind: coverage.kind,
    warrantyType: coverage.warrantyType,
    basis: coverage.basis,
    certainty: computed && coverage.basis !== "user" ? "estimated" : coverage.certainty,
    status: statusFor(endDate, asOf, endDate ? "open" : "unknown"),
    lengthDays: coverage.lengthDays,
    lengthMonths: coverage.lengthMonths,
    startDate: endDate ? startDate : null,
    endDate,
    ruleId: null,
    evidence: coverage.evidence,
    conflict,
    legalReviewPending: false,
  };
}

function receiptFallbackCoverage(
  line: ReceiptProductItem,
  kind: "return" | "warranty",
  ctx: ItemRulesContext,
  index: number,
  allowFallback: boolean,
): StoredCoverage | null {
  if (hasNoConsumerDates(ctx.purchaseType)) return null;
  if ((line.coverages ?? []).some((coverage) => coverage.kind === kind)) return null;
  if (kind === "return") {
    if (ctx.region !== "US") return null;
    const parsedFromText = ctx.returnDays == null && allowFallback ? parseReceiptReturnDays(ctx.warranty) : null;
    const lengthDays = ctx.returnDays ?? parsedFromText;
    if (!Number.isInteger(lengthDays) || lengthDays! < 0 || lengthDays! > 365) return null;
    return {
      id: `receipt:${line.lineId ?? `legacy-${index}`}:return`,
      kind: "return",
      warrantyType: null,
      basis: "stated",
      certainty: parsedFromText != null ? "estimated" : "confirmed",
      lengthDays: lengthDays!,
      lengthMonths: null,
      endDate: null,
      evidence: parsedFromText != null ? ctx.warranty ?? null : null,
      source: parsedFromText != null ? "extraction" : "user",
    };
  }
  if (!allowFallback) return null;
  const lengthMonths = parseManufacturerWarrantyMonths(ctx.warranty);
  if (lengthMonths == null) return null;
  return {
    id: `receipt:${line.lineId ?? `legacy-${index}`}:manufacturer`,
    kind: "warranty",
    warrantyType: "manufacturer",
    basis: "stated",
    certainty: "estimated",
    lengthDays: null,
    lengthMonths,
    endDate: null,
    evidence: ctx.warranty ?? null,
    source: "extraction",
  };
}

function receiptFallbackContract(
  line: ReceiptProductItem,
  coverage: StoredCoverage,
  ctx: ItemRulesContext,
  asOf: string,
): ItemContract {
  if (coverage.kind !== "return" || !ctx.purchaseDate || !isIsoDate(ctx.purchaseDate)) {
    return statedContract(line.lineId ?? "", coverage, ctx.purchaseDate ?? null, asOf);
  }
  const start = usReturnStart({
    purchaseDate: ctx.purchaseDate,
    deliveryDate: ctx.deliveryDate,
    isOnlinePurchase: ctx.isOnlinePurchase,
  });
  const endDate = addDaysIso(start.date, coverage.lengthDays ?? 0);
  return {
    id: coverage.id,
    kind: coverage.kind,
    warrantyType: null,
    basis: coverage.basis,
    certainty: coverage.certainty,
    status: statusFor(endDate, asOf, "open"),
    lengthDays: coverage.lengthDays,
    lengthMonths: null,
    startDate: start.date,
    endDate,
    ruleId: null,
    evidence: coverage.evidence,
    conflict: false,
    legalReviewPending: false,
  };
}

function markConflicts(contracts: ItemContract[]): ItemContract[] {
  const groups = new Map<string, ItemContract[]>();
  for (const contract of contracts) {
    // A statutory rule beside a stated contract is two contracts, not a conflict.
    if (contract.basis === "rule" || contract.status === "unknown") continue;
    const key = `${contract.kind}:${contract.warrantyType ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(contract);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    const ends = new Set(list.map((c) => c.endDate ?? `${c.lengthMonths ?? ""}:${c.lengthDays ?? ""}`));
    if (list.length > 1 && ends.size > 1) list.forEach((c) => { c.conflict = true; });
  }
  return contracts;
}

function ruleContract(partial: Omit<ItemContract, "conflict" | "evidence"> & { evidence?: string | null }): ItemContract {
  return { ...partial, evidence: partial.evidence ?? null, conflict: false };
}

function legalForLine(line: ReceiptProductItem, ctx: ItemRulesContext, asOf: string): ItemContract | null {
  if (ctx.region === "US") {
    return ruleContract({
      id: `rule:${line.lineId ?? "legacy"}:US:no_federal_legal_warranty`,
      kind: "warranty",
      warrantyType: "legal",
      basis: "rule",
      certainty: "confirmed",
      status: "not_applicable",
      lengthDays: null,
      lengthMonths: null,
      startDate: null,
      endDate: null,
      ruleId: "US:no_federal_legal_warranty",
      legalReviewPending: false,
    });
  }
  const ownCategory = optionalLineCategory(line.category);
  const category = ownCategory ?? optionalLineCategory(ctx.category) ?? "Other";
  if (!category || !ctx.purchaseDate || !isIsoDate(ctx.purchaseDate)) return null;
  const country = detectCountry({
    currency: ctx.currency, purchaseCountry: ctx.purchaseCountry, merchant: ctx.merchant,
  });
  if (!country) return null;
  const start = returnWindowStart(ctx.purchaseDate, ctx.deliveryDate);
  const estimated = !ownCategory || start.from === "purchase" || line.categorySource !== "user";
  if (country === "BR") {
    if (category === "Groceries") return null;
    const days = DURABLE.has(category) ? 90 : 30;
    const endDate = addDaysIso(start.date, days);
    return ruleContract({
      id: `rule:${line.lineId ?? "legacy"}:BR:CDC26`,
      kind: "warranty",
      warrantyType: "legal",
      basis: "rule",
      certainty: estimated ? "estimated" : "confirmed",
      status: statusFor(endDate, asOf, "open"),
      lengthDays: days,
      lengthMonths: null,
      startDate: start.date,
      endDate,
      ruleId: "BR:CDC-art-26",
      legalReviewPending: true,
    });
  }
  const years = LEGAL_WARRANTY_YEARS[country];
  if (!years || !DURABLE.has(category) || category === "Groceries") return null;
  const endDate = addYearsClamped(start.date, years);
  return ruleContract({
    id: `rule:${line.lineId ?? "legacy"}:${country}:legal`,
    kind: "warranty",
    warrantyType: "legal",
    basis: "rule",
    certainty: estimated ? "estimated" : "confirmed",
    status: statusFor(endDate, asOf, "open"),
    lengthDays: null,
    lengthMonths: years * 12,
    startDate: start.date,
    endDate,
    ruleId: country === "PT" ? "PT:DL-84/2021" : country === "ES" ? "ES:RDL-7/2021-art-120.1" : "EU:2019/771",
    legalReviewPending: false,
  });
}

function returnForLine(line: ReceiptProductItem, ctx: ItemRulesContext, asOf: string): ItemContract | null {
  if (!ctx.purchaseDate || !isIsoDate(ctx.purchaseDate)) return null;
  if (ctx.region === "US") {
    const suggestion = usStoreReturnWindow({
      merchant: ctx.merchant,
      purchaseDate: ctx.purchaseDate,
      deliveryDate: ctx.deliveryDate,
      isOnlinePurchase: ctx.isOnlinePurchase,
      category: line.category ?? ctx.category ?? null,
      itemNames: [line.name],
    });
    if (suggestion.status === "unknown") return null;
    if (suggestion.status === "no_fixed_window") {
      return ruleContract({
        id: `rule:${line.lineId ?? "legacy"}:US:${suggestion.store.key}:no_fixed_window`,
        kind: "return",
        warrantyType: null,
        basis: "rule",
        certainty: "confirmed",
        status: "not_applicable",
        lengthDays: null,
        lengthMonths: null,
        startDate: null,
        endDate: null,
        ruleId: `US:${suggestion.store.key}:no_fixed_window`,
        legalReviewPending: false,
      });
    }
    const provisional = suggestion.store.startsFrom === "delivery" && suggestion.startsFrom === "purchase" && ctx.isOnlinePurchase !== false;
    return ruleContract({
      id: `rule:${line.lineId ?? "legacy"}:US:${suggestion.store.key}:${suggestion.rule}`,
      kind: "return",
      warrantyType: null,
      basis: "rule",
      certainty: provisional ? "estimated" : "confirmed",
      status: statusFor(suggestion.deadline, asOf, "open"),
      lengthDays: suggestion.days,
      lengthMonths: null,
      startDate: suggestion.startsFrom === "delivery" && ctx.deliveryDate ? ctx.deliveryDate : ctx.purchaseDate,
      endDate: suggestion.deadline,
      ruleId: `US:${suggestion.store.key}:${suggestion.rule}${suggestion.holiday ? ":holiday" : ""}`,
      legalReviewPending: false,
    });
  }
  if (!isOnlineForConsumerRights(ctx.isOnlinePurchase, ctx.merchant, ctx.storeDomain)) return null;
  const country = detectCountry({
    currency: ctx.currency, purchaseCountry: ctx.purchaseCountry, merchant: ctx.merchant,
  });
  const days = country ? ONLINE_RETURN_DAYS[country] : undefined;
  if (!country || days == null) return null;
  const start = returnWindowStart(ctx.purchaseDate, ctx.deliveryDate);
  const endDate = addDaysIso(start.date, days);
  return ruleContract({
    id: `rule:${line.lineId ?? "legacy"}:${country}:withdrawal`,
    kind: "return",
    warrantyType: null,
    basis: "rule",
    certainty: start.from === "delivery" && ctx.isOnlinePurchase === true ? "confirmed" : "estimated",
    status: statusFor(endDate, asOf, "open"),
    lengthDays: days,
    lengthMonths: null,
    startDate: start.date,
    endDate,
    ruleId: country === "BR" ? "BR:CDC-art-49" : country === "PT" ? "PT:DL-24/2014" : `${country}:withdrawal`,
    legalReviewPending: country === "BR",
  });
}

/** Read-side deadlines. Does not read or write reminder columns. */
export function evaluateItemRights(lines: ReceiptProductItem[] | null | undefined, ctx: ItemRulesContext): ItemRights[] {
  const suppliedCountry = resolvePurchaseCountry({
    ...ctx, storeDomain: null, sellerCountry: null,
    isOnlinePurchase: ctx.isOnlinePurchase ?? null, purchaseCountry: ctx.purchaseCountry ?? null,
    deliveryCountry: ctx.deliveryCountry ?? null, savedCountry: ctx.savedCountry ?? null,
  });
  const geoIpFallback = suppliedCountry == null && isOnlineForConsumerRights(ctx.isOnlinePurchase, ctx.merchant, ctx.storeDomain)
    ? resolvePurchaseCountry({
      ...ctx,
      purchaseCountry: ctx.geoIpCountry ?? null,
      savedCountry: null,
      deliveryCountry: ctx.deliveryCountry ?? null,
      storeDomain: ctx.storeDomain ?? null,
      sellerCountry: ctx.sellerCountry ?? null,
      isOnlinePurchase: ctx.isOnlinePurchase ?? null,
    })
    : null;
  ctx = { ...ctx, purchaseCountry: suppliedCountry ?? geoIpFallback ?? resolvePurchaseCountry({
    ...ctx, isOnlinePurchase: ctx.isOnlinePurchase ?? null, purchaseCountry: ctx.purchaseCountry ?? null,
    deliveryCountry: ctx.deliveryCountry ?? null, storeDomain: ctx.storeDomain ?? null,
    sellerCountry: ctx.sellerCountry ?? null,
  }) };
  const asOf = asOfDate(ctx.asOf);
  const receiptTextScoped = isReceiptWarrantyTextScoped(ctx.warranty, (lines ?? []).map((line) => line.name));
  return (lines ?? []).map((line, index) => {
    const stated = (line.coverages ?? []).map((coverage) => statedContract(line.lineId ?? "", coverage, ctx.purchaseDate ?? null, asOf));
    const receiptReturn = receiptFallbackCoverage(line, "return", ctx, index, !receiptTextScoped);
    const receiptWarranty = receiptFallbackCoverage(line, "warranty", ctx, index, !receiptTextScoped);
    if (receiptReturn) stated.push(receiptFallbackContract(line, receiptReturn, ctx, asOf));
    if (receiptWarranty) stated.push(receiptFallbackContract(line, receiptWarranty, ctx, asOf));
    if (hasNoConsumerDates(ctx.purchaseType)) {
      const blocked = (["return", "warranty"] as const).map((kind) => ruleContract({
        id: `rule:${line.lineId ?? "legacy"}:purchase_type:${kind}`,
        kind,
        warrantyType: kind === "warranty" ? "legal" : null,
        basis: "rule",
        certainty: "confirmed",
        status: "not_applicable",
        lengthDays: null,
        lengthMonths: null,
        startDate: null,
        endDate: null,
        ruleId: `purchase_type:${ctx.purchaseType}`,
        legalReviewPending: false,
      }));
      return { lineId: line.lineId ?? null, index, contracts: markConflicts([...stated, ...blocked]) };
    }
    const contracts = [...stated];
    const legal = legalForLine(line, ctx, asOf);
    const ret = receiptReturn ? null : returnForLine(line, ctx, asOf);
    if (legal) contracts.push(legal);
    if (ret) contracts.push(ret);
    if (!contracts.some((c) => c.kind === "return")) {
      contracts.push(ruleContract({
        id: `rule:${line.lineId ?? "legacy"}:return:unknown`,
        kind: "return",
        warrantyType: null,
        basis: "rule",
        certainty: "unknown",
        status: "unknown",
        lengthDays: null,
        lengthMonths: null,
        startDate: null,
        endDate: null,
        ruleId: null,
        legalReviewPending: false,
      }));
    }
    if (!contracts.some((c) => c.kind === "warranty")) {
      contracts.push(ruleContract({
        id: `rule:${line.lineId ?? "legacy"}:warranty:unknown`,
        kind: "warranty",
        warrantyType: null,
        basis: "rule",
        certainty: "unknown",
        status: "unknown",
        lengthDays: null,
        lengthMonths: null,
        startDate: null,
        endDate: null,
        ruleId: null,
        legalReviewPending: false,
      }));
    }
    return { lineId: line.lineId ?? null, index, contracts: markConflicts(contracts) };
  });
}
