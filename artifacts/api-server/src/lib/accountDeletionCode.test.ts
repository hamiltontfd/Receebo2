import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, accountDeletionCodesTable } from "@workspace/db";

process.env.SESSION_SECRET ??= "deletion-code-test-secret";

const fixture = vi.hoisted(() => ({
  sent: [] as Array<{ userId: string; code: string }>,
  sendOk: true,
  perform: vi.fn(),
  deletedEmail: vi.fn(),
}));
vi.mock("./emailService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emailService")>()),
  getDeletionConfirmationContact: async (userId: string) =>
    userId.includes("no-email") ? null : { email: "ana@example.invalid", firstName: "Ana" },
  sendDeletionCodeEmail: async (userId: string, _contact: unknown, code: { code: string }) => {
    fixture.sent.push({ userId, code: code.code });
    return fixture.sendOk;
  },
  sendAccountDeletedEmail: fixture.deletedEmail,
}));
vi.mock("./accountDeletionRunner", () => ({ performAccountDeletion: fixture.perform, listAccountObjectPaths: async () => [] }));
vi.mock("./accountDeletionState", () => ({ isAccountDeletionInProgress: async (userId: string) => userId.includes("in-progress") }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.userId = req.headers["x-test-user"];
    return req.userId ? next() : res.sendStatus(401);
  },
}));

import {
  DELETION_CODE_MAX_ATTEMPTS, DELETION_CODE_TTL_MS, hashDeletionCode, issueDeletionCode, migrateAccountDeletionCodes,
  normalizeDeletionCode, verifyDeletionCode,
} from "./accountDeletionCode";
import { DELETION_CODE_SUBJECT, renderDeletionCodeEmail } from "./emailService";
import account, { maskEmail } from "../routes/account";

const users: string[] = [];
const newUser = (tag = "") => {
  const id = `deletion-code-fixture-${tag}${randomUUID()}`;
  users.push(id);
  return id;
};
let server: Server;
let base: string;

beforeAll(async () => {
  await migrateAccountDeletionCodes();
  const app = express();
  app.use(express.json(), account);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  if (users.length) await db.delete(accountDeletionCodesTable).where(inArray(accountDeletionCodesTable.userId, users));
});
beforeEach(() => {
  fixture.sent.length = 0;
  fixture.sendOk = true;
  fixture.perform.mockReset().mockResolvedValue({ status: 204 });
  fixture.deletedEmail.mockReset().mockResolvedValue(true);
});

describe("deletion code rules (real PostgreSQL)", () => {
  it("stores only a keyed hash and accepts the code once", async () => {
    const userId = newUser();
    const issued = await issueDeletionCode(userId);
    if (!issued.ok) throw new Error("expected a code");
    expect(issued.code).toMatch(/^\d{6}$/);
    const [row] = await db.select().from(accountDeletionCodesTable).where(eq(accountDeletionCodesTable.userId, userId));
    expect(row.codeHash).toBe(hashDeletionCode(userId, issued.code));
    expect(row.codeHash).not.toContain(issued.code);
    expect(await verifyDeletionCode(userId, `${issued.code.slice(0, 3)} ${issued.code.slice(3)}`)).toEqual({ ok: true });
    expect(await verifyDeletionCode(userId, issued.code)).toEqual({ ok: false, reason: "missing" });
  });

  it("expires after 15 minutes", async () => {
    const userId = newUser();
    const t0 = new Date();
    const issued = await issueDeletionCode(userId, t0);
    if (!issued.ok) throw new Error("expected a code");
    expect(await verifyDeletionCode(userId, issued.code, new Date(t0.getTime() + DELETION_CODE_TTL_MS))).toEqual({ ok: false, reason: "expired" });
  });

  it("locks after 5 wrong attempts, even for the right code", async () => {
    const userId = newUser();
    const issued = await issueDeletionCode(userId);
    if (!issued.ok) throw new Error("expected a code");
    const wrong = issued.code === "000000" ? "111111" : "000000";
    for (let i = 1; i < DELETION_CODE_MAX_ATTEMPTS; i++) {
      expect(await verifyDeletionCode(userId, wrong)).toEqual({ ok: false, reason: "invalid", attemptsLeft: DELETION_CODE_MAX_ATTEMPTS - i });
    }
    expect(await verifyDeletionCode(userId, wrong)).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(await verifyDeletionCode(userId, issued.code)).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("rate limits sends: 60 s apart, 5 per hour; a new code replaces the old one", async () => {
    const userId = newUser();
    const t0 = Date.now();
    const first = await issueDeletionCode(userId, new Date(t0));
    expect((await issueDeletionCode(userId, new Date(t0 + 10_000))).ok).toBe(false);
    let last = first;
    for (let i = 1; i < 5; i++) last = await issueDeletionCode(userId, new Date(t0 + i * 61_000));
    expect(last.ok).toBe(true);
    const blocked = await issueDeletionCode(userId, new Date(t0 + 6 * 61_000));
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect((await issueDeletionCode(userId, new Date(t0 + 61 * 60_000))).ok).toBe(true);
    if (first.ok && last.ok && first.code !== last.code) {
      expect((await verifyDeletionCode(userId, first.code, new Date(t0 + 61 * 60_000))).ok).toBe(false);
    }
  });

  it("normalises typed codes", () => {
    expect(normalizeDeletionCode("482-913")).toBe("482913");
    expect(normalizeDeletionCode("48291")).toBeNull();
    expect(normalizeDeletionCode(482913)).toBeNull();
  });
});

describe("deletion code email (placeholder copy)", () => {
  it("keeps the code out of the subject and preheader, with no delete link", () => {
    const email = renderDeletionCodeEmail({ code: "482913", expiresInMinutes: 15 });
    expect(email.subject).toBe(DELETION_CODE_SUBJECT);
    expect(email.subject).not.toMatch(/\d{6}/);
    const preheader = email.html.match(/<div style="display:none[^>]*>([^<]*)<\/div>/)?.[1] ?? "";
    expect(preheader).toBe("Use the code inside to confirm. It expires in 15 minutes.");
    expect(email.html).toContain(">482913<");
    expect(email.html).not.toMatch(/<a [^>]*href="[^"]*(delete|account)/i);
    expect(email.text).toContain("Your code:\n482913\n");
    expect(email.text).toContain("This code expires in 15 minutes and can only be used once.");
    expect(email.text).toContain("[ADDRESS]");
  });
  it("masks the address shown in the app", () => {
    expect(maskEmail("ana@example.com")).toBe("a••@example.com");
  });
});

describe("account deletion routes", () => {
  const post = (userId: string) => fetch(`${base}/account/deletion-code`, { method: "POST", headers: { "x-test-user": userId } });
  const del = (userId: string, body: unknown) => fetch(`${base}/account`, {
    method: "DELETE", headers: { "x-test-user": userId, "content-type": "application/json" }, body: JSON.stringify(body),
  });

  it("requires the emailed code, then deletes and confirms", async () => {
    const userId = newUser();
    expect((await del(userId, { confirmation: "DELETE" })).status).toBe(400);
    const sent = await post(userId);
    expect(sent.status).toBe(202);
    expect(await sent.json()).toMatchObject({ sentTo: "a••@example.invalid" });
    const { code } = fixture.sent[0];
    const wrong = await del(userId, { confirmation: "DELETE", code: code === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "deletion_code_invalid", attemptsLeft: 4 });
    expect(fixture.perform).not.toHaveBeenCalled();
    expect((await del(userId, { confirmation: "DELETE", code })).status).toBe(204);
    expect(fixture.perform).toHaveBeenCalledWith(userId, { cancelSubscription: true });
    expect(fixture.deletedEmail).toHaveBeenCalledWith(userId, expect.anything(), "requested");
    expect((await post(userId)).status).toBe(429);
  });

  it("voids the code when the email can't be sent", async () => {
    const userId = newUser();
    fixture.sendOk = false;
    expect((await post(userId)).status).toBe(502);
    expect((await del(userId, { confirmation: "DELETE", code: fixture.sent[0].code })).status).toBe(400);
  });

  it("refuses without an account email, and lets a started deletion resume", async () => {
    expect((await post(newUser("no-email-"))).status).toBe(409);
    expect((await del(newUser("in-progress-"), { confirmation: "DELETE" })).status).toBe(204);
  });
});
