import type { MailProviderId } from "@/lib/mailConnection";
import { SYNC_IN_PROGRESS_CODE, SYNC_IN_PROGRESS_COPY } from "@/lib/mailImportCopy";
import { TRIAL_CAP_MESSAGE } from "@/lib/trialCopy";
import { currencySymbol } from "@/lib/currency";
import type { PurchaseType } from "@/lib/purchaseType";

/** The server refused the approval because the free-trial receipt cap is reached. */
export class TrialCapError extends Error {
  constructor() { super(TRIAL_CAP_MESSAGE); }
}

/** A mailbox sync holds the user's data lock; the item stays and can be retried shortly. */
export class SyncInProgressError extends Error {
  constructor() { super(SYNC_IN_PROGRESS_COPY.en); }
}

/** The import was already approved or dismissed (e.g. a retry after a dropped response). */
export class AlreadyHandledError extends Error {
  constructor() { super("Pending import was already handled"); }
}

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

/** React Query key shared by the home card, /imports and the sheet. */
export const PENDING_QUERY_KEY = ["mail", "pending"] as const;
export const pendingDetailQueryKey = (id: number) => ["mail", "pending", "detail", id] as const;

export interface PendingImportItem {
  id: number;
  provider?: MailProviderId;
  gmailMessageId: string;
  originalFileName: string;
  merchant: string | null;
  total: number | null;
  currency: string | null;
  purchaseDate: string | null;
  category: string | null;
  summary: string | null;
  createdAt: string;
  /** Number of line items (older servers sent summed quantities; prefer productCount). */
  itemCount?: number;
  firstItemName?: string | null;
  productCount?: number;
  notableCount?: number;
  /** Detected purchase type (subscription/digital/ticket/service get no dates); null = not detected. */
  purchaseType?: PurchaseType | null;
}

export interface PendingTotal {
  currency: string | null;
  amount: number;
}

export interface PendingList {
  /** Ranked by the server: worth keeping first. */
  items: PendingImportItem[];
  count: number;
  totals: PendingTotal[];
}

export interface PendingImportDetail extends PendingImportItem {
  extraction: {
    merchant: string | null;
    purchaseDate: string | null;
    total: number | null;
    currency: string | null;
    category: string | null;
    summary: string | null;
    warranty: string | null;
    transactionNumber: string | null;
    products: Array<{ name: string; quantity: number | null; price: number | null }>;
    notableItems: Array<{ name: string; price: number | null; category: string | null; reason: string }>;
    purchaseCountry: string | null;
    isOnlinePurchase: boolean | null;
    deliveryDate: string | null;
  };
  objectPath: string;
  originalUrl: string;
}

export interface BulkApproveResult {
  approved: Array<{ id: number; receiptId: number }>;
  skipped: number[];
  notFound: number[];
  code?: "TRIAL_UPLOAD_LIMIT";
}

export interface BulkDismissResult {
  dismissed: number[];
  failed: number[];
  notFound: number[];
}

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  return body?.code;
}

export async function fetchPending(): Promise<PendingList> {
  const res = await fetch(`${BASE}api/mail/pending?meta=1`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load pending imports");
  const body = (await res.json()) as PendingList | PendingImportItem[];
  // An older server answers with the bare array.
  if (Array.isArray(body)) return { items: body, count: body.length, totals: [] };
  return body;
}

export async function fetchPendingDetail(id: number): Promise<PendingImportDetail> {
  const res = await fetch(`${BASE}api/mail/pending/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(res.status === 404 ? "Pending import not found" : "Failed to load import");
  return res.json() as Promise<PendingImportDetail>;
}

export async function approvePending(
  { id, category, purchaseType }: { id: number; category?: string; purchaseType?: PurchaseType },
): Promise<{ approved: boolean; receiptId: number }> {
  const res = await fetch(`${BASE}api/mail/pending/${id}/approve`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(category ? { category } : {}), ...(purchaseType ? { purchaseType } : {}) }),
  });
  if (!res.ok) {
    const code = await errorCode(res);
    if (res.status === 403 && (code === "trial_exhausted" || code === "TRIAL_UPLOAD_LIMIT")) {
      throw new TrialCapError();
    }
    if (res.status === 409) {
      throw code === SYNC_IN_PROGRESS_CODE ? new SyncInProgressError() : new AlreadyHandledError();
    }
    throw new Error("Failed to approve");
  }
  return res.json() as Promise<{ approved: boolean; receiptId: number }>;
}

export async function dismissPending(id: number): Promise<void> {
  const res = await fetch(`${BASE}api/mail/pending/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 409 && (await errorCode(res)) === SYNC_IN_PROGRESS_CODE) {
      throw new SyncInProgressError();
    }
    throw new Error("Failed to dismiss");
  }
}

async function bulk<T>(action: "bulk-approve" | "bulk-dismiss", ids: number[]): Promise<T> {
  const res = await fetch(`${BASE}api/mail/pending/${action}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const code = await errorCode(res);
    if (res.status === 409 && code === SYNC_IN_PROGRESS_CODE) throw new SyncInProgressError();
    if (res.status === 403 && (code === "trial_exhausted" || code === "TRIAL_UPLOAD_LIMIT")) {
      throw new TrialCapError();
    }
    throw new Error(action === "bulk-approve" ? "Failed to approve" : "Failed to dismiss");
  }
  return res.json() as Promise<T>;
}

/** The server accepts at most 50 ids per call; larger selections are sent in chunks. */
export const BULK_CHUNK = 50;

export async function bulkApprovePending(ids: number[]): Promise<BulkApproveResult> {
  const out: BulkApproveResult = { approved: [], skipped: [], notFound: [] };
  for (let i = 0; i < ids.length; i += BULK_CHUNK) {
    const r = await bulk<BulkApproveResult>("bulk-approve", ids.slice(i, i + BULK_CHUNK));
    out.approved.push(...r.approved);
    out.skipped.push(...r.skipped);
    out.notFound.push(...r.notFound);
    if (r.code) {
      out.code = r.code;
      // Trial slots are used up: the rest stays pending.
      out.skipped.push(...ids.slice(i + BULK_CHUNK));
      break;
    }
  }
  return out;
}

export async function bulkDismissPending(ids: number[]): Promise<BulkDismissResult> {
  const out: BulkDismissResult = { dismissed: [], failed: [], notFound: [] };
  for (let i = 0; i < ids.length; i += BULK_CHUNK) {
    const r = await bulk<BulkDismissResult>("bulk-dismiss", ids.slice(i, i + BULK_CHUNK));
    out.dismissed.push(...r.dismissed);
    out.failed.push(...(r.failed ?? []));
    out.notFound.push(...(r.notFound ?? []));
  }
  return out;
}

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  return `${currencySymbol(currency)}${amount.toFixed(2)}`;
}

/** "Soundbar 3.1 Dolby Atmos + 1 more", or the AI summary when no line items were read. */
export function itemsSummary(item: Pick<PendingImportItem, "firstItemName" | "productCount" | "summary">): string | null {
  if (item.firstItemName) {
    const more = (item.productCount ?? 1) - 1;
    return more > 0 ? `${item.firstItemName} + ${more} more` : item.firstItemName;
  }
  return item.summary;
}

/** "Oct 25, 2026" from an ISO date (YYYY-MM-DD) without time-zone drift. */
export function formatPurchaseDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "1 item" / "3 items": the number of receipt lines, never summed quantities or weights. */
export function itemCountLabel(item: Pick<PendingImportItem, "productCount" | "itemCount">): string | null {
  const n = item.productCount ?? item.itemCount;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) return null;
  return `${n} item${n === 1 ? "" : "s"}`;
}

export interface PendingMonthGroup {
  key: string;
  label: string;
  items: PendingImportItem[];
  totals: PendingTotal[];
}

/**
 * Group the ranked list by purchase month (newest month first). Inside a month
 * the server's ranking order is kept. Items without a date go last.
 */
export function groupByMonth(items: PendingImportItem[]): PendingMonthGroup[] {
  const groups = new Map<string, PendingMonthGroup>();
  for (const item of items) {
    const key = item.purchaseDate && /^\d{4}-\d{2}/.test(item.purchaseDate) ? item.purchaseDate.slice(0, 7) : "unknown";
    let group = groups.get(key);
    if (!group) {
      const label = key === "unknown"
        ? "No date"
        : new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      group = { key, label, items: [], totals: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  for (const group of groups.values()) group.totals = sumByCurrency(group.items);
  return [...groups.values()].sort((a, b) =>
    a.key === "unknown" ? 1 : b.key === "unknown" ? -1 : b.key.localeCompare(a.key));
}

export function sumByCurrency(items: PendingImportItem[]): PendingTotal[] {
  const sums = new Map<string | null, number>();
  for (const i of items) {
    if (typeof i.total !== "number") continue;
    sums.set(i.currency, (sums.get(i.currency) ?? 0) + i.total);
  }
  return [...sums.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

export function formatTotals(totals: PendingTotal[]): string {
  return totals.map((t) => formatMoney(t.amount, t.currency)).join(" + ");
}

/** Threshold for the "Dismiss under €20" shortcut (EUR items with a known total). */
export const DISMISS_UNDER_EUR = 20;

export function itemsUnder(items: PendingImportItem[], limit = DISMISS_UNDER_EUR): PendingImportItem[] {
  return items.filter((i) => i.currency === "EUR" && typeof i.total === "number" && i.total < limit);
}
