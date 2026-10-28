/**
 * Return and warranty reminder copy with the product and the amount
 * (Marketing final copy, 28 Oct 2026: /workspace/receebo/reminder-copy-product-amount.md,
 * PT/EU parts). Pure: builds plain strings; emailService escapes them for HTML.
 *
 * - {Item}: first notable item, else the most expensive line, cut at ~40 chars.
 * - {Items}: "{Item}", "{Item} and {Item2}" or "{Item}, {Item2} + N more".
 * - {Amount}: receipt total in its currency; without it "({Amount})" and
 *   "· {Amount}" disappear entirely.
 * - No product name: "your {Merchant} purchase" (never "Still happy with…").
 * - Pushes use only {Item}, never "+ N more".
 */
import { formatEmailDate, formatMoney } from "./emailFormat";

export interface ReminderPurchase {
  merchant?: string | null;
  notableItems?: ReadonlyArray<{ name?: string | null; price?: number | null }> | null;
  products?: ReadonlyArray<{ name?: string | null; price?: number | null }> | null;
  total?: number | null;
  currency?: string | null;
  /** YYYY-MM-DD */
  purchaseDate?: string | null;
}

export const ITEM_MAX_CHARS = 40;
export const PUSH_BODY_MAX_CHARS = 60;

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return v && v.toLowerCase() !== "item" ? v : null;
}

function cut(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Product names in reminder order: notable items, then lines by price (highest first), no duplicates. */
export function reminderItemNames(p: ReminderPurchase): string[] {
  const names: string[] = [];
  const add = (n: string | null) => { if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n); };
  for (const item of p.notableItems ?? []) add(clean(item?.name));
  const lines = [...(p.products ?? [])]
    .map((line, index) => ({ name: clean(line?.name), price: typeof line?.price === "number" ? line.price : null, index }))
    .sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || a.index - b.index);
  for (const line of lines) add(line.name);
  return names;
}

export function itemsPhrase(names: string[]): string | null {
  if (names.length === 0) return null;
  const [first, second] = names.map((n) => cut(n, ITEM_MAX_CHARS));
  if (names.length === 1) return first;
  if (names.length === 2) return `${first} and ${second}`;
  return `${first}, ${second} + ${names.length - 2} more`;
}

function amountOf(p: ReminderPurchase): string | null {
  return typeof p.total === "number" && Number.isFinite(p.total) ? formatMoney(p.total, p.currency) : null;
}

function dateOf(iso: string | null | undefined): string | null {
  return iso ? formatEmailDate(iso) : null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Parts {
  item: string | null;
  /** {Item} or "your {Merchant} purchase". */
  subjectItem: string;
  amount: string | null;
  merchant: string | null;
  bought: string | null;
  itemLine: string;
  pushBody: string;
}

function parts(p: ReminderPurchase): Parts {
  const names = reminderItemNames(p);
  const item = names[0] ? cut(names[0], ITEM_MAX_CHARS) : null;
  const merchant = clean(p.merchant);
  const amount = amountOf(p);
  const bought = dateOf(p.purchaseDate);
  const fallback = merchant ? `your ${merchant} purchase` : "your purchase";
  const where = [merchant, bought ? `bought ${bought}` : null].filter(Boolean).join(", ");
  const itemLine = [itemsPhrase(names), amount, where || null].filter(Boolean).join(" · ");
  let pushBody: string;
  if (item) {
    const tail = [amount, merchant].filter(Boolean).join(" · ");
    const room = PUSH_BODY_MAX_CHARS - (tail ? tail.length + 3 : 0);
    pushBody = [cut(item, Math.max(12, room)), tail || null].filter(Boolean).join(" · ");
  } else {
    pushBody = [merchant ? `${merchant} purchase` : "Your purchase", amount].filter(Boolean).join(" · ");
  }
  return { item, subjectItem: item ?? fallback, amount, merchant, bought, itemLine, pushBody };
}

export interface ReminderMessage {
  subject: string;
  preheader: string;
  title: string;
  itemLine: string;
  /** "Still happy with your {Item}?" (return emails with a product name only). */
  secondary: string | null;
  body: string;
  /** Grey one-liner: where the deadline comes from, or the other warranty. */
  note: string | null;
  footer: string;
  push: { title: string; body: string };
}

export interface ReturnReminderInput extends ReminderPurchase {
  deadline: Date | string;
  daysRemaining: number;
  /** "law": statutory withdrawal period of `windowDays`; "store": the retailer's policy. */
  basis?: "law" | "store";
  windowDays?: number;
}

export function renderReturnReminder(input: ReturnReminderInput): ReminderMessage {
  const p = parts(input);
  const deadline = formatEmailDate(input.deadline) ?? "";
  const days = Math.max(0, Math.floor(input.daysRemaining));
  const amountParen = p.amount ? ` (${p.amount})` : "";
  // No product and no amount: say when it was bought instead.
  const fromBought = !p.item && !p.amount && p.bought ? ` from ${p.bought}` : "";
  const what = `${p.subjectItem}${amountParen}${fromBought}`;
  const subject = days <= 0
    ? `Last day to return ${what}`
    : days === 1
      ? `Return window for ${what} closes tomorrow`
      : `Return window for ${what} closes in ${days} days`;
  const preheader = [
    p.merchant && p.bought ? `Bought at ${p.merchant} on ${p.bought}.` : p.merchant ? `Bought at ${p.merchant}.` : p.bought ? `Bought on ${p.bought}.` : null,
    `Last day: ${deadline}.`,
  ].filter(Boolean).join(" ");
  const note = input.basis === "store" && p.merchant
    ? `Based on ${p.merchant}'s return policy. Conditions vary, so check your receipt or the store's site.`
    : input.basis === "law"
      ? `Based on the ${input.windowDays ?? 14}-day withdrawal period for online purchases.`
      : null;
  const pushTitle = days <= 0 ? "Last day to return" : days === 1 ? "Return window closes tomorrow" : `Return window closes in ${days} days`;
  return {
    subject,
    preheader,
    title: `${capitalize(p.subjectItem)}: return window closes ${deadline}`,
    itemLine: p.itemLine,
    secondary: p.item ? `Still happy with your ${p.item}?` : null,
    body: `If you're not keeping it, start your return with ${p.merchant ?? "the store"} by ${deadline}. Your receipt is saved in Receebo, so you'll have it if they ask.`,
    note,
    footer: "You're getting this because return reminders are on.",
    push: { title: pushTitle, body: p.pushBody },
  };
}

export interface WarrantyReminderInput extends ReminderPurchase {
  kind: "legal" | "manufacturer";
  /** YYYY-MM-DD */
  expiresOn: string;
  /** The other warranty, when it is still running. */
  other?: { kind: "legal" | "manufacturer"; expiresOn: string } | null;
}

export function renderWarrantyReminder(input: WarrantyReminderInput): ReminderMessage {
  const p = parts(input);
  const date = formatEmailDate(input.expiresOn) ?? input.expiresOn;
  const label = input.kind === "legal" ? "Legal warranty" : "Manufacturer warranty";
  const amountParen = p.amount ? ` (${p.amount})` : "";
  const fromBought = !p.item && !p.amount && p.bought ? ` from ${p.bought}` : "";
  const otherDate = input.other ? formatEmailDate(input.other.expiresOn) : null;
  return {
    subject: `${label} for ${p.subjectItem}${amountParen}${fromBought} ends on ${date}`,
    preheader: p.merchant && p.bought ? `Bought at ${p.merchant} on ${p.bought}.` : p.merchant ? `Bought at ${p.merchant}.` : p.bought ? `Bought on ${p.bought}.` : `${label} ends on ${date}.`,
    title: `${capitalize(p.subjectItem)}: ${label.toLowerCase()} ends ${date}`,
    itemLine: p.itemLine,
    secondary: null,
    body: `If something isn't working as it should, contact ${input.kind === "legal" ? (p.merchant ?? "the store") : "the manufacturer"} before ${date}. Your receipt is saved in Receebo as proof of purchase.`,
    note: input.other && otherDate
      ? `Your ${input.other.kind} warranty is separate and runs until ${otherDate}.`
      : null,
    footer: "You're getting this because warranty reminders are on.",
    push: { title: `${label} ends ${date}`, body: p.pushBody },
  };
}
