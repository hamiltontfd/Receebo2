import { randomUUID } from "crypto";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, gmailSeenMessagesTable, mailImportFailuresTable, pendingImportsTable, trialAiReadsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const extraction = vi.hoisted(() => ({ text: vi.fn(), file: vi.fn(), precheck: vi.fn() }));
vi.mock("./receiptExtraction", () => ({
  extractReceiptDataFromText: extraction.text,
  extractReceiptData: extraction.file,
  precheckEmailIsReceipt: extraction.precheck,
}));

import { syncMailboxClaimed } from "./mailSync";
import { MAX_IMPORT_ATTEMPTS, recordMailImportFailure } from "./mailImportFailures";
import { claimTrialAiRead, countTrialAiReads, TRIAL_AI_READ_LIMIT } from "./trialAiReads";
import type { MailProvider } from "./mailProviders/types";

const users: string[] = [];
function newUser() {
  const id = `mail-fail-test-${randomUUID()}`;
  users.push(id);
  return id;
}

beforeEach(() => {
  extraction.precheck.mockResolvedValue(true);
});

afterEach(async () => {
  extraction.precheck.mockReset();
  extraction.text.mockReset();
  extraction.file.mockReset();
  for (const userId of users.splice(0)) {
    await db.delete(mailImportFailuresTable).where(eq(mailImportFailuresTable.userId, userId));
    await db.delete(gmailSeenMessagesTable).where(eq(gmailSeenMessagesTable.userId, userId));
    await db.delete(pendingImportsTable).where(eq(pendingImportsTable.userId, userId));
    await db.delete(trialAiReadsTable).where(eq(trialAiReadsTable.userId, userId));
  }
});

const ORDER_HTML = "<p>Order #A-1 confirmed. Bosch drill PSB 1800, total 89,99 EUR. Thank you for your purchase at the store.</p>";

function fakeProvider(messageId: string, lastSyncedAt: Date | null = null) {
  const sync = {
    lastSyncedAt,
    windows: [] as Date[],
    markSynced: vi.fn(async (_userId: string, syncedAt: Date) => { sync.lastSyncedAt = syncedAt; }),
  };
  const provider: MailProvider & { sync: typeof sync } = {
    sync,
    id: "outlook",
    label: "Outlook",
    logger: pino({ level: "silent" }),
    isConfigured: () => true,
    getAccessToken: async () => "token",
    listCandidateMessageIds: async (_token, since) => { sync.windows.push(since); return [messageId]; },
    getMessage: async () => ({
      id: messageId, subject: "Your order confirmation", from: "orders@shop.example",
      receivedAt: "2026-10-20T10:00:00Z", pdfAttachments: [], html: ORDER_HTML, text: null,
    }),
    downloadAttachment: async () => Buffer.from(""),
    getLastSyncedAt: async () => sync.lastSyncedAt,
    markSynced: sync.markSynced,
  };
  return provider;
}

async function failureRow(userId: string) {
  const [row] = await db.select().from(mailImportFailuresTable).where(eq(mailImportFailuresTable.userId, userId));
  return row;
}
async function isSeen(userId: string, messageId: string) {
  const rows = await db.select().from(gmailSeenMessagesTable).where(and(
    eq(gmailSeenMessagesTable.userId, userId), eq(gmailSeenMessagesTable.gmailMessageId, messageId)));
  return rows.length > 0;
}

describe("email import retry cap", () => {
  it("stops retrying a failing email after 3 attempts and counts one trial read only", async () => {
    expect(MAX_IMPORT_ATTEMPTS).toBe(3);
    const userId = newUser();
    const provider = fakeProvider("msg-1");
    extraction.text.mockRejectedValue(new Error("model returned invalid JSON"));

    for (let attempt = 1; attempt <= MAX_IMPORT_ATTEMPTS; attempt++) {
      await syncMailboxClaimed(userId, provider, { aiReadCap: true });
      const row = await failureRow(userId);
      expect(row?.attempts).toBe(attempt);
      expect(row?.status).toBe(attempt < MAX_IMPORT_ATTEMPTS ? "retrying" : "failed");
      expect(row?.lastError).toContain("invalid JSON");
    }
    expect(extraction.text).toHaveBeenCalledTimes(MAX_IMPORT_ATTEMPTS);
    expect(await isSeen(userId, "msg-1")).toBe(true);
    // Retries of the same email never consumed extra trial reads.
    expect(await countTrialAiReads(userId)).toBe(1);

    // A 4th sync skips it: no AI call, no pending item.
    await syncMailboxClaimed(userId, provider, { aiReadCap: true });
    expect(extraction.text).toHaveBeenCalledTimes(MAX_IMPORT_ATTEMPTS);
    const pending = await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.userId, userId));
    expect(pending).toHaveLength(0);
  });

  it("clears the failure record when a retry succeeds", async () => {
    const userId = newUser();
    const provider = fakeProvider("msg-2");
    extraction.text.mockRejectedValueOnce(new Error("429 rate limited"));
    extraction.text.mockResolvedValueOnce({ isReceipt: false });
    await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    expect((await failureRow(userId))?.attempts).toBe(1);
    expect(await isSeen(userId, "msg-2")).toBe(false);
    await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    expect(await failureRow(userId)).toBeUndefined();
    expect(await isSeen(userId, "msg-2")).toBe(true);
  });

  it("records attempts atomically per message", async () => {
    const userId = newUser();
    expect(await recordMailImportFailure(userId, "outlook", "m", "e1")).toEqual({ attempts: 1, failed: false });
    expect(await recordMailImportFailure(userId, "outlook", "m", "e2")).toEqual({ attempts: 2, failed: false });
    expect(await recordMailImportFailure(userId, "outlook", "m", "e3")).toEqual({ attempts: 3, failed: true });
    expect(await recordMailImportFailure(userId, "outlook", "other", "e")).toEqual({ attempts: 1, failed: false });
  });
});

describe("incremental search window", () => {
  it("first sync looks back 90 days; a complete sync moves the anchor to its start", async () => {
    const userId = newUser();
    const provider = fakeProvider("msg-win");
    extraction.text.mockResolvedValue({ isReceipt: false });
    const before = Date.now();
    await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    const first = provider.sync.windows[0]!.getTime();
    expect(Math.abs(first - (before - 90 * 24 * 60 * 60 * 1000))).toBeLessThan(5_000);
    expect(provider.sync.markSynced).toHaveBeenCalledTimes(1);
    const anchor = provider.sync.lastSyncedAt!;
    expect(anchor.getTime()).toBeGreaterThanOrEqual(before);

    await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    expect(provider.sync.windows[1]!.getTime()).toBe(anchor.getTime() - 60 * 60 * 1000);
  });

  it("keeps the anchor when a message is left retryable, so the next window still covers it", async () => {
    const userId = newUser();
    const anchor = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const provider = fakeProvider("msg-retry", anchor);
    extraction.text.mockRejectedValueOnce(new Error("429 rate limited"));
    await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    expect(provider.sync.markSynced).not.toHaveBeenCalled();
    expect(provider.sync.lastSyncedAt).toBe(anchor);
    expect(await isSeen(userId, "msg-retry")).toBe(false);
  });

  it("keeps the anchor when the trial AI budget stops the run (imported after subscribing)", async () => {
    const userId = newUser();
    for (let i = 0; i < TRIAL_AI_READ_LIMIT; i++) await claimTrialAiRead(userId, "upload", `u${i}`);
    const anchor = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const provider = fakeProvider("msg-trial", anchor);
    await syncMailboxClaimed(userId, provider, { aiReadCap: true });
    expect(extraction.text).not.toHaveBeenCalled();
    expect(provider.sync.markSynced).not.toHaveBeenCalled();
    expect(await isSeen(userId, "msg-trial")).toBe(false);

    // After subscribing (no cap) the same window finds and imports it.
    extraction.text.mockResolvedValue({ isReceipt: false });
    await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    expect(provider.sync.windows[1]!.getTime()).toBe(anchor.getTime() - 60 * 60 * 1000);
    expect(extraction.text).toHaveBeenCalledTimes(1);
    expect(await isSeen(userId, "msg-trial")).toBe(true);
    expect(provider.sync.markSynced).toHaveBeenCalledTimes(1);
  });

  it("moves the anchor once a failing message is given up for good", async () => {
    const userId = newUser();
    const provider = fakeProvider("msg-giveup", new Date(Date.now() - 60_000));
    extraction.text.mockRejectedValue(new Error("model returned invalid JSON"));
    for (let attempt = 1; attempt < MAX_IMPORT_ATTEMPTS; attempt++) {
      await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    }
    expect(provider.sync.markSynced).not.toHaveBeenCalled();
    await syncMailboxClaimed(userId, provider, { aiReadCap: false });
    expect(await isSeen(userId, "msg-giveup")).toBe(true);
    expect(provider.sync.markSynced).toHaveBeenCalledTimes(1);
  });
});

describe("email pre-check", () => {
  it("skips a body the pre-check rejects without a full extraction or a trial read", async () => {
    const userId = newUser();
    extraction.precheck.mockResolvedValue(false);
    await syncMailboxClaimed(userId, fakeProvider("msg-pre"), { aiReadCap: true });
    expect(extraction.precheck).toHaveBeenCalledTimes(1);
    expect(extraction.text).not.toHaveBeenCalled();
    expect(await countTrialAiReads(userId)).toBe(0);
    expect(await isSeen(userId, "msg-pre")).toBe(true);
    expect(await failureRow(userId)).toBeUndefined();
    const pending = await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.userId, userId));
    expect(pending).toHaveLength(0);
  });

  it("runs the full extraction (one trial read) when the pre-check passes", async () => {
    const userId = newUser();
    extraction.text.mockResolvedValue({ isReceipt: false });
    await syncMailboxClaimed(userId, fakeProvider("msg-pass"), { aiReadCap: true });
    expect(extraction.precheck).toHaveBeenCalledTimes(1);
    expect(extraction.text).toHaveBeenCalledTimes(1);
    expect(await countTrialAiReads(userId)).toBe(1);
  });
});

describe("trial AI reads", () => {
  it("counts a retry of the same email or receipt once, and still enforces the cap", async () => {
    const userId = newUser();
    expect(await claimTrialAiRead(userId, "email", "same")).toBe(true);
    expect(await claimTrialAiRead(userId, "email", "same")).toBe(true);
    expect(await countTrialAiReads(userId)).toBe(1);
    // The same ref from another source is a different read.
    expect(await claimTrialAiRead(userId, "upload", "same")).toBe(true);
    expect(await countTrialAiReads(userId)).toBe(2);
    for (let i = 2; i < TRIAL_AI_READ_LIMIT; i++) expect(await claimTrialAiRead(userId, "email", `m${i}`)).toBe(true);
    expect(await countTrialAiReads(userId)).toBe(TRIAL_AI_READ_LIMIT);
    expect(await claimTrialAiRead(userId, "email", "new-one")).toBe(false);
    // At the cap, a retry of an already-counted email is still allowed (it was paid for).
    expect(await claimTrialAiRead(userId, "email", "same")).toBe(true);
    // Reads without a ref are never deduplicated.
    const other = newUser();
    expect(await claimTrialAiRead(other, "upload", null)).toBe(true);
    expect(await claimTrialAiRead(other, "upload", null)).toBe(true);
    expect(await countTrialAiReads(other)).toBe(2);
  });
});
