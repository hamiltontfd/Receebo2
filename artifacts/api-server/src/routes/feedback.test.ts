/**
 * Smile rating (lifecycle emails) on the real PostgreSQL: the GET page writes
 * nothing, the POST keeps the last click, comments attach to the rating, bad
 * tokens save nothing, and account deletion leaves only an anonymous rating.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db, emailFeedbackTable, emailSendsTable } from "@workspace/db";

const fx = vi.hoisted(() => ({ deliver: vi.fn() }));
vi.mock("../lib/emailService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/emailService")>()),
  deliverEmail: fx.deliver,
  getDeletionConfirmationContact: async () => ({ email: "ana@example.invalid", firstName: "Ana", locale: "pt-PT" }),
  formatLocaleFor: async (_u: string, l: string) => l,
}));
vi.mock("../lib/emailLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/emailLocale")>()),
  getUserEmailLocale: async () => "pt-PT",
}));
import feedback from "./feedback";
import { createFeedbackToken } from "../lib/feedbackToken";
import { anonymizeLifecycleEmailDataSql } from "../lib/lifecycleEmailStore";
import { sendTrialEndedEmail } from "../lib/lifecycleEmails";

const user = `feedback-fixture-${randomUUID()}`;
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), express.urlencoded({ extended: true }), feedback);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await db.delete(emailSendsTable).where(eq(emailSendsTable.userId, user));
  await db.delete(emailFeedbackTable).where(eq(emailFeedbackTable.userId, user));
  await db.execute(sql`DELETE FROM email_feedback WHERE user_id IS NULL AND email_type = 'test_anonymized'`);
});
const feedbackRows = () => db.select().from(emailFeedbackTable).where(eq(emailFeedbackTable.userId, user));

describe("lifecycle email feedback (real PostgreSQL)", () => {
  it("trial_ended: claims a send row, links carry its id, pt-PT copy; a refused send frees the key", async () => {
    fx.deliver.mockResolvedValueOnce({ ok: false, id: null });
    const deletionDate = new Date(Date.now() + 60 * 86_400_000);
    expect(await sendTrialEndedEmail(user, { deletionDate })).toBe(false);
    expect(await db.select().from(emailSendsTable).where(eq(emailSendsTable.userId, user))).toHaveLength(0);
    fx.deliver.mockResolvedValueOnce({ ok: true, id: "re_123" });
    expect(await sendTrialEndedEmail(user, { deletionDate })).toBe(true);
    const [row] = await db.select().from(emailSendsTable).where(eq(emailSendsTable.userId, user));
    expect(row).toMatchObject({ emailType: "trial_ended", locale: "pt-PT", resendId: "re_123" });
    expect(row.sentAt).not.toBeNull();
    const sent = fx.deliver.mock.calls.at(-1)![0];
    expect(sent.subject).toBe("Obrigado por experimentar o Receebo, Ana");
    expect(sent.idempotencyKey).toBe(`trial_ended:${user}:${deletionDate.toISOString().slice(0, 10)}`);
    expect(sent.html).toContain("/api/feedback/r/");
    // Already sent: no second delivery.
    expect(await sendTrialEndedEmail(user, { deletionDate })).toBe(true);
    expect(fx.deliver).toHaveBeenCalledTimes(2);
  });

  it("GET writes nothing (scanner-safe); POST saves, last click wins, click_count grows; comment kept", async () => {
    const token = createFeedbackToken({ userId: user, emailType: "trial_ended", emailSendId: 42, locale: "pt-PT" })!;
    for (const v of ["good", "ok", "bad"]) {
      const page = await fetch(`${base}/feedback/r/${encodeURIComponent(token)}?v=${v}`);
      expect(page.status).toBe(200);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(page.headers.get("x-robots-tag")).toContain("noindex");
      expect(await page.text()).toContain("A guardar…");
    }
    expect(await feedbackRows()).toHaveLength(0);

    const post = (body: Record<string, string>) => fetch(`${base}/feedback`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body),
    });
    const first = await post({ token, v: "bad" });
    expect(first.status).toBe(200);
    expect(await first.text()).toContain("Obrigado! Quer dizer-nos mais alguma coisa?");
    await post({ token, v: "good" });
    const [row] = await feedbackRows();
    expect(row).toMatchObject({ rating: "good", clickCount: 2, locale: "pt-PT", emailSendId: 42 });

    const comment = await fetch(`${base}/feedback/comment`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, comment: "Gostei muito" }),
    });
    expect(comment.status).toBe(200);
    await post({ token, v: "ok" });
    const [after] = await feedbackRows();
    expect(after).toMatchObject({ rating: "ok", clickCount: 3, comment: "Gostei muito" });
  });

  it("tampered or expired tokens save nothing", async () => {
    const token = createFeedbackToken({ userId: user, emailType: "trial_ended", emailSendId: 7, locale: "en" })!;
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect((await fetch(`${base}/feedback/r/${encodeURIComponent(tampered)}?v=good`)).status).toBe(400);
    const res = await fetch(`${base}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tampered, v: "good" }) });
    expect(res.status).toBe(400);
    const old = createFeedbackToken({ userId: user, emailType: "trial_ended", emailSendId: 7, locale: "en" }, new Date(Date.now() - 31 * 86_400_000))!;
    const expired = await fetch(`${base}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: old, v: "good" }) });
    expect(expired.status).toBe(410);
    expect((await feedbackRows()).filter((r) => r.emailSendId === 7)).toHaveLength(0);
  });

  it("account deletion: rating kept anonymously, comment and send log deleted", async () => {
    const other = `feedback-delete-${randomUUID()}`;
    await db.insert(emailFeedbackTable).values({ userId: other, emailType: "test_anonymized", emailSendId: 9, rating: "bad", locale: "pt-BR", comment: "texto livre" });
    await db.insert(emailSendsTable).values({ userId: other, emailType: "trial_ended", idempotencyKey: `trial_ended:${other}:2027-01-01`, locale: "pt-BR" });
    await db.transaction(async (tx) => { for (const s of anonymizeLifecycleEmailDataSql(other)) await tx.execute(s); });
    expect(await db.select().from(emailSendsTable).where(eq(emailSendsTable.userId, other))).toHaveLength(0);
    expect(await db.select().from(emailFeedbackTable).where(eq(emailFeedbackTable.userId, other))).toHaveLength(0);
    const anon = await db.execute(sql`SELECT user_id, email_send_id, comment, rating, locale FROM email_feedback WHERE email_type = 'test_anonymized' AND user_id IS NULL`);
    expect(anon.rows).toEqual(expect.arrayContaining([{ user_id: null, email_send_id: null, comment: null, rating: "bad", locale: "pt-BR" }]));
  });
});
