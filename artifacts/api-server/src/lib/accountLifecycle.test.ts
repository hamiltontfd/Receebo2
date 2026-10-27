import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, accountLifecycleTable } from "@workspace/db";

const fixture = vi.hoisted(() => ({
  status: new Map<string, any>(),
  warn: vi.fn(), deleted: vi.fn(), perform: vi.fn(),
}));
vi.mock("./subscriptionStatus", () => ({
  getSubscriptionStatus: async (userId: string) => fixture.status.get(userId),
}));
vi.mock("./emailService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emailService")>()),
  sendDeletionWarningEmail: fixture.warn,
  sendAccountDeletedEmail: fixture.deleted,
  getDeletionConfirmationContact: async () => ({ email: "user@example.invalid", firstName: "Ana" }),
}));
vi.mock("./accountDeletionRunner", () => ({
  performAccountDeletion: fixture.perform,
  listAccountObjectPaths: async () => ["/objects/uploads/a", "/objects/uploads/b"],
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.userId = req.headers["x-test-user"];
    return req.userId ? next() : res.sendStatus(401);
  },
}));

import {
  migrateAccountLifecycle, runDataRetentionSweep, nextLifecycleAction, deletionDueAt, accessEndedAt,
  dataDeletionEnabled, DAY_MS,
} from "./accountLifecycle";
import { renderDeletionWarningEmail, renderAccountDeletedEmail } from "./emailService";
import account, { EXPORT_FROZEN_MESSAGE } from "../routes/account";

const users: string[] = [];
const frozen = (endedDaysAgo: number, now: Date) => ({
  accessState: "trial_expired", canUseApp: false,
  trialEndAt: new Date(now.getTime() - endedDaysAgo * DAY_MS), currentPeriodEnd: null,
});
function newUser() {
  const id = `lifecycle-fixture-${randomUUID()}`;
  users.push(id);
  return id;
}

let server: Server;
let base: string;
beforeAll(async () => {
  await migrateAccountLifecycle();
  const app = express();
  app.use(express.json(), account);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  if (users.length) await db.delete(accountLifecycleTable).where(inArray(accountLifecycleTable.userId, users));
});
beforeEach(() => {
  fixture.warn.mockReset().mockResolvedValue(true);
  fixture.deleted.mockReset().mockResolvedValue(true);
  fixture.perform.mockReset().mockResolvedValue({ status: 204 });
});

describe("deletion schedule (pure)", () => {
  const now = new Date("2026-10-27T03:00:00Z");
  it("deletes 60 days after access ended, but never sooner than 30 days after first seen frozen", () => {
    const ended = new Date("2026-10-20T00:00:00Z");
    expect(deletionDueAt(ended, now).toISOString()).toBe("2026-12-19T00:00:00.000Z");
    const longAgo = new Date("2026-06-01T00:00:00Z");
    expect(deletionDueAt(longAgo, now).getTime()).toBe(now.getTime() + 30 * DAY_MS);
  });
  it("uses the trial end or last paid period end as the end of access", () => {
    const trialEnd = new Date("2026-10-01T00:00:00Z");
    expect(accessEndedAt({ accessState: "trial_expired", trialEndAt: trialEnd, currentPeriodEnd: null }, now)).toEqual(trialEnd);
    const periodEnd = new Date("2026-09-15T00:00:00Z");
    expect(accessEndedAt({ accessState: "subscription_required", trialEndAt: null, currentPeriodEnd: periodEnd }, now)).toEqual(periodEnd);
    expect(accessEndedAt({ accessState: "subscription_required", trialEndAt: null, currentPeriodEnd: null }, now)).toEqual(now);
  });
  it("warns at 30 and 7 days, deletes only after the final warning went out", () => {
    const due = new Date(now.getTime() + 40 * DAY_MS);
    const row = { deletionDueAt: due, warning30SentAt: null, warning7SentAt: null };
    expect(nextLifecycleAction(row, now)).toEqual({ kind: "none" });
    expect(nextLifecycleAction(row, new Date(due.getTime() - 30 * DAY_MS))).toEqual({ kind: "warn", stage: "30d" });
    expect(nextLifecycleAction({ ...row, warning30SentAt: now }, new Date(due.getTime() - 10 * DAY_MS))).toEqual({ kind: "none" });
    expect(nextLifecycleAction({ ...row, warning30SentAt: now }, new Date(due.getTime() - 7 * DAY_MS))).toEqual({ kind: "warn", stage: "7d" });
    expect(nextLifecycleAction(row, due)).toEqual({ kind: "reschedule_and_warn" });
    expect(nextLifecycleAction({ ...row, warning7SentAt: new Date(due.getTime() - 2 * DAY_MS) }, due).kind).toBe("postpone_delete");
    expect(nextLifecycleAction({ ...row, warning7SentAt: new Date(due.getTime() - 7 * DAY_MS) }, due)).toEqual({ kind: "delete" });
  });
  it("is off unless DATA_DELETION_ENABLED is exactly true", () => {
    expect(dataDeletionEnabled({})).toBe(false);
    expect(dataDeletionEnabled({ DATA_DELETION_ENABLED: "1" })).toBe(false);
    expect(dataDeletionEnabled({ DATA_DELETION_ENABLED: "true" })).toBe(true);
  });
});

describe("lifecycle emails (placeholder copy)", () => {
  it("states the exact date, offers a copy by email (no download link) and keeps [ADDRESS]", () => {
    const date = new Date("2026-12-19T00:00:00Z");
    const w30 = renderDeletionWarningEmail({ stage: "30d", deletionDate: date, receiptCount: 4, firstName: "Ana", baseUrl: "https://receebo.net" });
    expect(w30.subject).toBe("Your Receebo receipts will be deleted on 19 Dec 2026");
    expect(w30.text).toContain("your 4 receipts");
    expect(w30.text).toContain("Email contact@receebo.net");
    expect(w30.text).toContain("https://receebo.net/settings#upgrade-plans");
    expect(w30.html).toContain("[ADDRESS]");
    expect(w30.html).not.toMatch(/download/i);
    expect(w30.html).not.toMatch(/unsubscribe/i);
    const w7 = renderDeletionWarningEmail({ stage: "7d", deletionDate: date, receiptCount: 1 });
    expect(w7.subject).toBe("7 days left before we delete your receipts");
    expect(w7.html).toContain("Last reminder: your receipts will be deleted on 19 Dec 2026");
    const done = renderAccountDeletedEmail({ reason: "inactive" });
    expect(done.text).toContain("We keep only the billing records the law requires.");
    expect(renderAccountDeletedEmail({ reason: "requested" }).text).toContain("As you asked");
  });
});

describe("daily retention sweep (real PostgreSQL)", () => {
  it("dry run by default: records the schedule, sends nothing, deletes nothing", async () => {
    const now = new Date();
    const userId = newUser();
    fixture.status.set(userId, frozen(100, now));
    const result = await runDataRetentionSweep({ now, enabled: false, userIds: [userId] });
    expect(result).toMatchObject({ enabled: false, frozen: 1, dryRunWarnings: 1, warned: 0, deleted: 0 });
    const [row] = await db.select().from(accountLifecycleTable).where(eq(accountLifecycleTable.userId, userId));
    expect(row.deletionDueAt.getTime()).toBe(now.getTime() + 30 * DAY_MS);
    expect(row.warning30SentAt).toBeNull();
    const late = new Date(now.getTime() + 31 * DAY_MS);
    expect(await runDataRetentionSweep({ now: late, enabled: false, userIds: [userId] })).toMatchObject({ dryRunDeletions: 1, deleted: 0 });
    expect(fixture.warn).not.toHaveBeenCalled();
    expect(fixture.perform).not.toHaveBeenCalled();
  });

  it("when enabled: 30-day warning, 7-day warning, deletion and confirmation, each once", async () => {
    const t0 = new Date();
    const userId = newUser();
    fixture.status.set(userId, frozen(30, t0)); // due in 30 days
    await runDataRetentionSweep({ now: t0, enabled: true, userIds: [userId] });
    await runDataRetentionSweep({ now: t0, enabled: true, userIds: [userId] });
    expect(fixture.warn).toHaveBeenCalledTimes(1);
    expect(fixture.warn).toHaveBeenLastCalledWith(userId, expect.objectContaining({ stage: "30d" }));
    const t23 = new Date(t0.getTime() + 23 * DAY_MS);
    await runDataRetentionSweep({ now: t23, enabled: true, userIds: [userId] });
    expect(fixture.warn).toHaveBeenCalledTimes(2);
    expect(fixture.warn).toHaveBeenLastCalledWith(userId, expect.objectContaining({ stage: "7d" }));
    const t30 = new Date(t0.getTime() + 30 * DAY_MS + 1000);
    const result = await runDataRetentionSweep({ now: t30, enabled: true, userIds: [userId] });
    expect(result.deleted).toBe(1);
    expect(fixture.perform).toHaveBeenCalledWith(userId, { cancelSubscription: false });
    expect(fixture.deleted).toHaveBeenCalledWith(userId, expect.objectContaining({ email: "user@example.invalid" }), "inactive");
    expect(await db.select().from(accountLifecycleTable).where(eq(accountLifecycleTable.userId, userId))).toHaveLength(0);
  });

  it("subscribing before the date cancels the deletion", async () => {
    const now = new Date();
    const userId = newUser();
    fixture.status.set(userId, frozen(59, now));
    await runDataRetentionSweep({ now, enabled: true, userIds: [userId] });
    fixture.status.set(userId, { accessState: "paid", canUseApp: true });
    const result = await runDataRetentionSweep({ now: new Date(now.getTime() + 40 * DAY_MS), enabled: true, userIds: [userId] });
    expect(result.cancelled).toBe(1);
    expect(fixture.perform).not.toHaveBeenCalled();
    expect(await db.select().from(accountLifecycleTable).where(eq(accountLifecycleTable.userId, userId))).toHaveLength(0);
  });

  it("does not delete when the final warning failed to send; retries the warning instead", async () => {
    const now = new Date();
    const userId = newUser();
    fixture.status.set(userId, frozen(55, now));
    await db.insert(accountLifecycleTable).values({
      userId, accessEndedAt: new Date(now.getTime() - 55 * DAY_MS),
      deletionDueAt: new Date(now.getTime() + 5 * DAY_MS), warning30SentAt: now,
    }); // due in 5 days -> final warning now
    fixture.warn.mockResolvedValue(false);
    await runDataRetentionSweep({ now, enabled: true, userIds: [userId] });
    const [row] = await db.select().from(accountLifecycleTable).where(eq(accountLifecycleTable.userId, userId));
    expect(row.warning7SentAt).toBeNull();
    await runDataRetentionSweep({ now: new Date(now.getTime() + 6 * DAY_MS), enabled: true, userIds: [userId] });
    expect(fixture.perform).not.toHaveBeenCalled();
  });
});

describe("export while frozen", () => {
  it("refuses in-app export once frozen and points to contact@receebo.net", async () => {
    const userId = newUser();
    fixture.status.set(userId, frozen(3, new Date()));
    const res = await fetch(`${base}/account/export`, { headers: { "x-test-user": userId } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "account_frozen", message: EXPORT_FROZEN_MESSAGE });
    expect(EXPORT_FROZEN_MESSAGE).toContain("contact@receebo.net");
  });
});
