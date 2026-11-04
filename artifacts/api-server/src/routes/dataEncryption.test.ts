import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  db, pool, receiptsTable, pendingImportsTable, pushSubscriptionsTable, emailConnectionsTable,
  isFieldEnvelope, resetFieldCryptoForTests, setFieldCryptoLogger,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { actionKey } from "../lib/actionRateLimit";

vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-user"] ?? null }),
}));
vi.mock("../lib/legalAcceptance", () => ({
  hasCurrentLegalAcceptance: async () => true,
  requireCurrentLegalAcceptance: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/accountDeletionState", () => ({ isAccountDeletionInProgress: async () => false }));
vi.mock("../lib/userDataLock", () => ({
  lockUserDataMutation: (handler: any) => handler,
  tryLockUserDataMutation: (handler: unknown) => handler,
  withUserDataLock: (_id: string, work: () => unknown) => work(),
}));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, canUpload: true, accessState: "paid" }),
  receiptCapReached: () => false,
}));
vi.mock("../lib/extractionQueue", () => ({ enqueueExtraction: vi.fn() }));
import receipts from "./receipts";
import { backfillTable, ENCRYPTED_FIELDS, runDataEncryptionBackfill } from "../lib/dataEncryptionBackfill";

let server: Server;
let base: string;
const users: string[] = [];
let logs: string[];
beforeAll(async () => {
  const app = express();
  app.use(express.json(), receipts);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  // Each test starts without a key (the suite can also run with one set globally).
  vi.stubEnv("DATA_ENCRYPTION_KEY", "");
  vi.stubEnv("DATA_ENCRYPTION_KEY_PREVIOUS", "");
  resetFieldCryptoForTests();
  logs = [];
  setFieldCryptoLogger((_level, message, details) => logs.push(`${message} ${JSON.stringify(details ?? {})}`));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetFieldCryptoForTests();
  if (users.length) {
    await db.delete(receiptsTable).where(inArray(receiptsTable.userId, users));
    await db.delete(pendingImportsTable).where(inArray(pendingImportsTable.userId, users));
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, users));
    await db.delete(emailConnectionsTable).where(inArray(emailConnectionsTable.userId, users));
    await pool.query("DELETE FROM action_rate_limits WHERE key = ANY($1::text[])", [users.map(u => actionKey("receipt-read", u))]);
  }
  users.length = 0;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

const newUser = () => { const u = `enc-user-${randomUUID()}`; users.push(u); return u; };
const withKey = () => vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
const receipt = (userId: string, extra: Partial<typeof receiptsTable.$inferInsert> = {}) => ({
  userId, objectPath: `/objects/uploads/${randomUUID()}`, originalFileName: "r.pdf",
  contentType: "application/pdf", status: "completed", merchant: "Loja", ...extra,
});
const raw = async (id: number) =>
  (await pool.query("SELECT summary, ocr_text, products, notable_items FROM receipts WHERE id=$1", [id])).rows[0];

describe("encrypted content columns", () => {
  it("writes envelopes with the key and reads them back transparently", async () => {
    withKey();
    const userId = newUser();
    const [row] = await db.insert(receiptsTable).values(receipt(userId, {
      summary: "Bought a sofa", ocrText: "NIF 999999990 Rua das Flores",
      products: [{ name: "Sofa", quantity: 1, price: 499 }],
      notableItems: [{ name: "Sofa", reason: "durable" }],
    })).returning();
    expect(row!.ocrText).toBe("NIF 999999990 Rua das Flores");
    const stored = await raw(row!.id);
    for (const v of [stored.summary, stored.ocr_text, stored.products, stored.notable_items]) expect(isFieldEnvelope(v)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("999999990");
    const [read] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, row!.id));
    expect(read).toMatchObject({ summary: "Bought a sofa", products: [{ name: "Sofa", quantity: 1, price: 499 }] });
    await db.update(receiptsTable).set({ ocrText: "edited" }).where(eq(receiptsTable.id, row!.id));
    expect((await db.select().from(receiptsTable).where(eq(receiptsTable.id, row!.id)))[0]!.ocrText).toBe("edited");
  });
  it("mixed state: legacy plaintext rows and encrypted rows read side by side", async () => {
    const userId = newUser();
    const [plain] = await db.insert(receiptsTable).values(receipt(userId, { ocrText: "legacy text", products: [{ name: "Old", quantity: 1, price: 1 }] })).returning();
    withKey();
    const [sealed] = await db.insert(receiptsTable).values(receipt(userId, { ocrText: "new text" })).returning();
    expect(isFieldEnvelope((await raw(plain!.id)).ocr_text)).toBe(false);
    const rows = await db.select().from(receiptsTable).where(inArray(receiptsTable.id, [plain!.id, sealed!.id]));
    expect(rows.map(r => r.ocrText).sort()).toEqual(["legacy text", "new text"]);
  });
  it("an undecryptable value reads as empty, logs field only, and never throws", async () => {
    withKey();
    const userId = newUser();
    const [row] = await db.insert(receiptsTable).values(receipt(userId, { ocrText: "secret ocr", products: [{ name: "Hidden", quantity: 1, price: 2 }] })).returning();
    withKey(); // different key, old one not in the ring
    const [read] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, row!.id));
    expect(read!.ocrText).toBeNull();
    expect(read!.products).toEqual([]);
    expect(read!.merchant).toBe("Loja");
    expect(logs.join("\n")).toContain("receipts.ocr_text");
    expect(logs.join("\n")).not.toContain("secret ocr");
  });
  it("without a key everything stays plaintext exactly as before", async () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    const userId = newUser();
    const [row] = await db.insert(receiptsTable).values(receipt(userId, { ocrText: "plain", products: [{ name: "P", quantity: 1, price: 3 }] })).returning();
    const stored = await raw(row!.id);
    expect(stored.ocr_text).toBe("plain");
    expect(stored.products).toEqual([{ name: "P", quantity: 1, price: 3 }]);
    expect(await runDataEncryptionBackfill()).toEqual({ status: "no_key", report: {} });
    expect((await raw(row!.id)).ocr_text).toBe("plain");
  });
  it("other encrypted fields: extraction_data, push keys, Outlook account email", async () => {
    withKey();
    const userId = newUser();
    const [imp] = await db.insert(pendingImportsTable).values({
      userId, gmailMessageId: randomUUID(), objectPath: "/objects/x", originalFileName: "x.pdf",
      extractionData: { merchant: "Shop", ocrText: "secret body" } as never,
    }).returning();
    const [push] = await db.insert(pushSubscriptionsTable).values({ userId, endpoint: `https://push.invalid/${randomUUID()}`, p256dh: "pkey", auth: "akey" }).returning();
    const [conn] = await db.insert(emailConnectionsTable).values({ userId, provider: "outlook", accountEmail: "me@example.com", refreshToken: "enc:v1:x" }).returning();
    const r1 = (await pool.query("SELECT extraction_data FROM pending_imports WHERE id=$1", [imp!.id])).rows[0];
    const r2 = (await pool.query("SELECT p256dh, auth FROM push_subscriptions WHERE id=$1", [push!.id])).rows[0];
    const r3 = (await pool.query("SELECT account_email FROM email_connections WHERE id=$1", [conn!.id])).rows[0];
    expect(isFieldEnvelope(r1.extraction_data)).toBe(true);
    expect(isFieldEnvelope(r2.p256dh) && isFieldEnvelope(r2.auth)).toBe(true);
    expect(isFieldEnvelope(r3.account_email)).toBe(true);
    expect((await db.select().from(pendingImportsTable).where(eq(pendingImportsTable.id, imp!.id)))[0]!.extractionData).toMatchObject({ ocrText: "secret body" });
    expect((await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, push!.id)))[0]).toMatchObject({ p256dh: "pkey", auth: "akey" });
    expect((await db.select().from(emailConnectionsTable).where(eq(emailConnectionsTable.id, conn!.id)))[0]!.accountEmail).toBe("me@example.com");
  });
});

describe("background backfill", () => {
  it("encrypts plaintext rows idempotently, keeps updated_at and content, logs counts only", async () => {
    const userId = newUser();
    const inserted = await db.insert(receiptsTable).values(Array.from({ length: 5 }, (_, i) => receipt(userId, {
      summary: `summary ${i}`, ocrText: `ocr ${i}`, products: [{ name: `item ${i}`, quantity: 1, price: i }],
    }))).returning();
    const before = (await pool.query("SELECT id, updated_at FROM receipts WHERE user_id=$1 ORDER BY id", [userId])).rows;
    withKey();
    const t = ENCRYPTED_FIELDS.find(f => f.table === "receipts")!;
    const first = await backfillTable(t, { batchSize: 2, pauseMs: 0, userId });
    expect(first).toEqual({ encrypted: 5, conflicts: 0 });
    for (const r of inserted) {
      const s = await raw(r.id);
      for (const v of [s.summary, s.ocr_text, s.products, s.notable_items]) expect(isFieldEnvelope(v)).toBe(true);
    }
    const after = (await pool.query("SELECT id, updated_at FROM receipts WHERE user_id=$1 ORDER BY id", [userId])).rows;
    expect(after).toEqual(before);
    const read = await db.select().from(receiptsTable).where(eq(receiptsTable.userId, userId));
    expect(read.map(r => r.ocrText).sort()).toEqual(["ocr 0", "ocr 1", "ocr 2", "ocr 3", "ocr 4"]);
    const sealed = await Promise.all(inserted.map(r => raw(r.id)));
    const res = await runDataEncryptionBackfill({ pauseMs: 0, userId });
    expect(res).toMatchObject({ status: "done", report: { receipts: { encrypted: 0, conflicts: 0 } } });
    expect(await Promise.all(inserted.map(r => raw(r.id)))).toEqual(sealed);
    expect(logs.join("\n")).not.toContain("ocr 1");
  });
  it("only one instance runs at a time", async () => {
    withKey();
    const holder = await pool.connect();
    try {
      await holder.query("SELECT pg_advisory_lock(hashtext('receebo'), hashtext('data-encryption-backfill'))");
      expect((await runDataEncryptionBackfill()).status).toBe("busy");
    } finally {
      await holder.query("SELECT pg_advisory_unlock(hashtext('receebo'), hashtext('data-encryption-backfill'))");
      holder.release();
    }
  });
});

describe("search with encrypted fields", () => {
  const search = async (userId: string, q: string) => {
    const res = await fetch(`${base}/receipts?q=${encodeURIComponent(q)}`, { headers: { "x-test-user": userId } });
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: Array<{ id: number }> }).items.map(i => i.id);
  };
  it("matches encrypted ocr/summary/products in memory and plaintext ones in SQL, same order", async () => {
    const userId = newUser();
    const [legacy] = await db.insert(receiptsTable).values(receipt(userId, { purchaseDate: "2026-01-01", ocrText: "Fatura com Cafeteira legacy" })).returning();
    withKey();
    const [encOcr] = await db.insert(receiptsTable).values(receipt(userId, { purchaseDate: "2026-03-01", ocrText: "Fatura com CAFETEIRA nova" })).returning();
    const [encProd] = await db.insert(receiptsTable).values(receipt(userId, { purchaseDate: "2026-02-01", products: [{ name: "Cafeteira Delta", quantity: 1, price: 50 }] })).returning();
    const [encSummary] = await db.insert(receiptsTable).values(receipt(userId, { purchaseDate: "2025-12-01", summary: "Comprou uma cafeteira" })).returning();
    await db.insert(receiptsTable).values(receipt(userId, { purchaseDate: "2026-04-01", ocrText: "nada a ver", merchant: "Outra" }));
    await db.insert(receiptsTable).values(receipt(userId, { purchaseDate: "2026-04-02", merchant: "Cafeteira Store" }));
    const hits = await search(userId, "cafeteira");
    const store = (await db.select().from(receiptsTable).where(eq(receiptsTable.merchant, "Cafeteira Store")))
      .filter(r => r.userId === userId)[0]!;
    expect(hits).toEqual([store.id, encOcr!.id, encProd!.id, legacy!.id, encSummary!.id]);
    // A term that only appears in the ciphertext alphabet never matches.
    expect(await search(userId, "enc:v1")).toEqual([]);
    // ILIKE wildcards behave the same in memory.
    expect(await search(userId, "caf_teira nova")).toEqual([encOcr!.id]);
    // Another user's receipts are never searched.
    expect(await search(newUser(), "cafeteira")).toEqual([]);
  });
});
