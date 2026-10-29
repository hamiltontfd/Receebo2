import { randomUUID } from "crypto";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db, gmailSeenMessagesTable, mailImportFailuresTable, pendingImportsTable, receiptsTable,
  recurringSuppliersTable, trialAiReadsTable,
} from "@workspace/db";

const extraction = vi.hoisted(() => ({ text: vi.fn(), file: vi.fn(), precheck: vi.fn() }));
vi.mock("./receiptExtraction", () => ({
  extractReceiptDataFromText: extraction.text,
  extractReceiptData: extraction.file,
  precheckEmailIsReceipt: extraction.precheck,
}));
// Owner-* users have unlimited access; the rest have none (no plan, no trial).
vi.mock("./ownerAccess", () => ({ hasOwnerAccess: async (id: string) => id.startsWith("owner-") }));
vi.mock("./objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class { deleteObject = async () => {}; },
  objectStorageClient: { bucket: () => ({ file: () => ({ save: async () => {} }) }) },
}));

import { syncMailboxClaimed } from "./mailSync";
import type { MailMessage, MailProvider } from "./mailProviders/types";

const users: string[] = [];
function newUser(prefix: "owner" | "nobody") {
  const id = `${prefix}-recurring-sync-${randomUUID()}`;
  users.push(id);
  return id;
}

const prevDir = process.env.PRIVATE_OBJECT_DIR;
beforeEach(() => {
  process.env.PRIVATE_OBJECT_DIR = "/bucket/private";
  extraction.precheck.mockResolvedValue(true);
});
afterEach(async () => {
  process.env.PRIVATE_OBJECT_DIR = prevDir;
  extraction.precheck.mockReset();
  extraction.text.mockReset();
  for (const userId of users.splice(0)) {
    await db.delete(mailImportFailuresTable).where(eq(mailImportFailuresTable.userId, userId));
    await db.delete(gmailSeenMessagesTable).where(eq(gmailSeenMessagesTable.userId, userId));
    await db.delete(pendingImportsTable).where(eq(pendingImportsTable.userId, userId));
    await db.delete(receiptsTable).where(eq(receiptsTable.userId, userId));
    await db.delete(recurringSuppliersTable).where(eq(recurringSuppliersTable.userId, userId));
    await db.delete(trialAiReadsTable).where(eq(trialAiReadsTable.userId, userId));
  }
});

const EDP_HTML = "<p>A sua fatura de eletricidade de outubro está disponível. Fatura FT 2026/123, total a pagar 61,20 EUR. Obrigado por ser cliente.</p>";

function provider(partial: Partial<MailMessage> & { id: string }) {
  const message: MailMessage = {
    subject: "Fatura EDP outubro", from: "EDP Comercial <faturas@edp.pt>",
    receivedAt: "2026-10-20T10:00:00Z", pdfAttachments: [], html: EDP_HTML, text: null, ...partial,
  } as MailMessage;
  const listed: Array<"on" | "off" | null> = [];
  const p: MailProvider & { listed: typeof listed } = {
    listed,
    id: "outlook",
    label: "Outlook",
    logger: pino({ level: "silent" }),
    isConfigured: () => true,
    getAccessToken: async () => "token",
    listCandidateMessageIds: async (_t, _since, filter) => {
      listed.push(filter?.senderDecision?.(message.from ?? null) ?? null);
      return [message.id];
    },
    getMessage: async () => message,
    downloadAttachment: async () => Buffer.from(""),
    getLastSyncedAt: async () => null,
    markSynced: async () => {},
  };
  return p;
}

const edpExtraction = {
  isReceipt: true, merchant: "EDP Comercial – Comercialização de Energia, S.A.", purchaseDate: "2026-10-18",
  total: 61.2, currency: "EUR", category: "Home", summary: "Fatura de eletricidade", ocrText: "", warranty: null,
  transactionNumber: "FT 2026/123", products: [], notableItems: [], purchaseCountry: "PT", isOnlinePurchase: true,
  deliveryDate: null, purchaseType: "service",
};

async function decide(userId: string, supplierKey: string, status: "on" | "off", senderDomains: string[], category: string | null = null) {
  await db.insert(recurringSuppliersTable).values({
    userId, supplierKey, displayName: supplierKey, kind: "utility", status, senderDomains, category,
  });
}
async function isSeen(userId: string, messageId: string) {
  return (await db.select().from(gmailSeenMessagesTable).where(and(
    eq(gmailSeenMessagesTable.userId, userId), eq(gmailSeenMessagesTable.gmailMessageId, messageId)))).length > 0;
}
const pendings = (userId: string) => db.select().from(pendingImportsTable).where(eq(pendingImportsTable.userId, userId));
const receipts = (userId: string) => db.select().from(receiptsTable).where(eq(receiptsTable.userId, userId));

describe("mail sync and recurring suppliers", () => {
  it("undecided utility bills are still skipped (no AI read)", async () => {
    const userId = newUser("owner");
    const result = await syncMailboxClaimed(userId, provider({ id: "m-undecided" }), { aiReadCap: false });
    expect(result.queued).toBe(0);
    expect(extraction.text).not.toHaveBeenCalled();
  });

  it("'on' supplier: the bill bypasses the utility filter and is imported straight into the library", async () => {
    const userId = newUser("owner");
    await decide(userId, "edp", "on", ["edp.pt"], "Home");
    extraction.text.mockResolvedValue(edpExtraction);
    const p = provider({ id: "m-on" });
    const result = await syncMailboxClaimed(userId, p, { aiReadCap: false });
    expect(p.listed).toEqual(["on"]);
    expect(result).toMatchObject({ queued: 1, autoImported: 1 });
    const [r] = await receipts(userId);
    expect(r).toMatchObject({ merchant: edpExtraction.merchant, category: "Home", status: "completed" });
    expect((await pendings(userId)).every((x) => x.status !== "pending")).toBe(true);
    expect(await isSeen(userId, "m-on")).toBe(true);
  });

  it("'on' supplier without access left (e.g. trial cap): stays pending, with the sender domain", async () => {
    const userId = newUser("nobody");
    await decide(userId, "edp", "on", ["edp.pt"]);
    extraction.text.mockResolvedValue(edpExtraction);
    const result = await syncMailboxClaimed(userId, provider({ id: "m-cap" }), { aiReadCap: false });
    expect(result).toMatchObject({ queued: 1, autoImported: 0 });
    expect(await receipts(userId)).toHaveLength(0);
    const [pending] = await pendings(userId);
    expect(pending!.status).toBe("pending");
    expect(pending!.extractionData?.senderDomain).toBe("edp.pt");
  });

  it("'off' supplier by sender: skipped before any AI read and marked seen", async () => {
    const userId = newUser("owner");
    await decide(userId, "netflix", "off", ["netflix.com"]);
    const p = provider({ id: "m-off", from: "Netflix <info@account.netflix.com>", subject: "Your Netflix receipt",
      html: "<p>Your receipt. Netflix Standard plan, total 13,99 EUR. Thank you for your payment.</p>" });
    const result = await syncMailboxClaimed(userId, p, { aiReadCap: false });
    expect(p.listed).toEqual(["off"]);
    expect(result.queued).toBe(0);
    expect(extraction.text).not.toHaveBeenCalled();
    expect(await pendings(userId)).toHaveLength(0);
    expect(await isSeen(userId, "m-off")).toBe(true);
  });

  it("'off' supplier by merchant (unknown sender): discarded after extraction, no pending", async () => {
    const userId = newUser("owner");
    await decide(userId, "netflix", "off", []);
    extraction.text.mockResolvedValue({ ...edpExtraction, merchant: "Netflix International B.V.", total: 13.99, summary: "Streaming", purchaseType: "subscription" });
    const p = provider({ id: "m-off2", from: "Billing <orders@shop.example>", subject: "Your order confirmation",
      html: "<p>Order #A-1 confirmed. Standard streaming plan, total 13,99 EUR. Thank you for your purchase at the store.</p>" });
    const result = await syncMailboxClaimed(userId, p, { aiReadCap: false });
    expect(extraction.text).toHaveBeenCalledTimes(1);
    expect(result.queued).toBe(0);
    expect(await pendings(userId)).toHaveLength(0);
    expect(await isSeen(userId, "m-off2")).toBe(true);
  });

  it("Apple 'on': an Apple subscription is auto-imported, a one-off App Store purchase stays pending", async () => {
    const userId = newUser("owner");
    await db.insert(recurringSuppliersTable).values({
      userId, supplierKey: "apple", displayName: "Apple", kind: "subscription", status: "on", senderDomains: [],
    });
    const appleHtml = "<p>Your receipt from Apple. Order ID MXYZ123. Total 30,95 EUR. Thank you for your purchase.</p>";
    const appleBase = {
      ...edpExtraction, merchant: "Apple Distribution International Ltd.", category: "Entertainment",
      summary: null, transactionNumber: "MXYZ123", total: 30.95,
    };
    extraction.text.mockResolvedValueOnce({ ...appleBase, purchaseType: null, products: [{ name: "Apple One Premium" }] });
    const sub = await syncMailboxClaimed(userId, provider({ id: "m-apple-sub", from: "Apple <no_reply@email.apple.com>",
      subject: "Your receipt from Apple", html: appleHtml }), { aiReadCap: false });
    expect(sub).toMatchObject({ queued: 1, autoImported: 1 });

    extraction.text.mockResolvedValueOnce({ ...appleBase, purchaseType: "digital", total: 4.99, products: [{ name: "Some Game" }] });
    const oneOff = await syncMailboxClaimed(userId, provider({ id: "m-apple-app", from: "Apple <no_reply@email.apple.com>",
      subject: "Your receipt from Apple", html: appleHtml }), { aiReadCap: false });
    expect(oneOff).toMatchObject({ queued: 1, autoImported: 0 });
    expect(await receipts(userId)).toHaveLength(1);
    expect((await pendings(userId)).filter((x) => x.status === "pending")).toHaveLength(1);
  });
});
