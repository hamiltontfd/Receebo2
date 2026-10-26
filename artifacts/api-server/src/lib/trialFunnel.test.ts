import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  db, accountTrialsTable, trialUploadsTable, legalAcceptancesTable,
  trialFunnelSubjectsTable, trialFunnelEventsTable, userBillingTable,
} from "@workspace/db";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.userId = req.headers["x-test-user"];
    return req.userId ? next() : res.sendStatus(401);
  },
}));
vi.mock("./legalAcceptance", () => ({
  requireCurrentLegalAcceptance: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("./ownerAccess", () => ({ hasOwnerAccess: async () => false }));
vi.mock("@clerk/express", () => ({ clerkClient: {} }));

import billing from "../routes/billing";
import { migrateTrialFunnel } from "./trialFunnelMigration";
import { confirmPaidFunnel, createFunnelCheckout, funnelSubject, recordFunnelEvent } from "./trialFunnel";
import { trialFunnelReport } from "./trialFunnelReport";

let server: Server;
let base: string;
let userId: string;
const users: string[] = [];
const stripeIds: string[] = [];
const stripeAccounts: string[] = [];

async function events(user = userId) {
  const subjectId = await funnelSubject(user);
  return subjectId ? db.select().from(trialFunnelEventsTable).where(eq(trialFunnelEventsTable.subjectId, subjectId)) : [];
}
async function start(user = userId) {
  await db.insert(legalAcceptancesTable).values({ userId: user, termsVersion: "test", privacyVersion: "test", confirmedAge: true });
  await db.insert(accountTrialsTable).values({ userId: user, endsAt: new Date(Date.now() + 86_400_000) }).onConflictDoNothing();
  return (await funnelSubject(user))!;
}
async function post(body: unknown, user: string | null = userId) {
  return fetch(`${base}/billing/trial-funnel`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await migrateTrialFunnel();
  const app = express();
  app.use(express.json());
  app.use(billing);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => { userId = `funnel_test_${randomUUID()}`; users.push(userId); });
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  for (const id of users) {
    await db.delete(trialUploadsTable).where(eq(trialUploadsTable.userId, id));
    await db.delete(accountTrialsTable).where(eq(accountTrialsTable.userId, id));
    await db.delete(legalAcceptancesTable).where(eq(legalAcceptancesTable.userId, id));
    await db.delete(trialFunnelSubjectsTable).where(eq(trialFunnelSubjectsTable.userId, id));
    await db.delete(userBillingTable).where(eq(userBillingTable.userId, id));
  }
  for (const id of stripeIds) {
    await db.execute(sql`DELETE FROM stripe.invoices WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM stripe.subscriptions WHERE id = ${id}`);
  }
  for (const id of stripeAccounts) await db.execute(sql`DELETE FROM stripe.accounts WHERE id = ${id}`);
});

describe("privacy-safe no-card funnel", () => {
  it("records real consent and trial success only once and rolls back failed writes", async () => {
    await start();
    await db.insert(legalAcceptancesTable).values({ userId, termsVersion: "test", privacyVersion: "test", confirmedAge: true });
    await db.insert(accountTrialsTable).values({ userId, endsAt: new Date() }).onConflictDoNothing();
    expect((await events()).map(e => e.event).sort()).toEqual(["account_trial_started", "consent_accepted"]);
    const failedUser = `funnel_test_${randomUUID()}`; users.push(failedUser);
    await expect(db.transaction(async tx => {
      await tx.insert(accountTrialsTable).values({ userId: failedUser, endsAt: new Date() });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await funnelSubject(failedUser)).toBeUndefined();
  });
  it("counts only successful receipts across concurrent workers and retries, not content or deletions", async () => {
    await start();
    const paths = Array.from({ length: 3 }, () => `funnel/${randomUUID()}`);
    for (const path of paths) await db.insert(trialUploadsTable).values({
      userId, objectPath: path, state: "processing", expiresAt: new Date(),
    });
    expect((await events()).some(e => e.event.includes("receipt"))).toBe(false);
    await Promise.all(paths.map(path => db.update(trialUploadsTable).set({ state: "succeeded" })
      .where(eq(trialUploadsTable.objectPath, path))));
    await db.update(trialUploadsTable).set({ state: "succeeded" }).where(eq(trialUploadsTable.userId, userId));
    const milestones = (await events()).filter(e => e.event.includes("receipt"));
    expect(milestones.map(e => e.event).sort()).toEqual(["first_receipt_succeeded", "third_receipt_succeeded"]);
    expect(Object.keys(milestones[0]).sort()).toEqual(["dimension", "event", "interval", "occurredAt", "reason", "subjectId"]);
    expect(JSON.stringify(milestones)).not.toContain(userId);
  });
  it("records receipt_limit_reached once when the 5th trial receipt succeeds", async () => {
    await start();
    const paths = Array.from({ length: 5 }, () => `funnel/${randomUUID()}`);
    for (const path of paths) await db.insert(trialUploadsTable).values({
      userId, objectPath: path, state: "processing", expiresAt: new Date(),
    });
    for (const path of paths.slice(0, 4)) await db.update(trialUploadsTable).set({ state: "succeeded" })
      .where(eq(trialUploadsTable.objectPath, path));
    expect((await events()).some(e => e.event === "receipt_limit_reached")).toBe(false);
    await db.update(trialUploadsTable).set({ state: "succeeded" }).where(eq(trialUploadsTable.userId, userId));
    expect((await events()).filter(e => e.event === "receipt_limit_reached")).toHaveLength(1);
  });
  it("validates paywall state, rejects arbitrary properties and server event spoofing, and deduplicates tabs", async () => {
    await start();
    expect((await post({ event: "paid_activation_confirmed" })).status).toBe(400);
    expect((await post({ event: "paywall_viewed", reason: "trial_expired", email: "do-not-store" })).status).toBe(400);
    expect((await post({ event: "paywall_viewed", reason: "trial_expired" }, null)).status).toBe(401);
    await post({ event: "paywall_viewed", reason: "trial_expired" });
    expect((await events()).some(e => e.event === "paywall_viewed")).toBe(false);
    await db.update(accountTrialsTable).set({ endsAt: new Date(0) }).where(eq(accountTrialsTable.userId, userId));
    await Promise.all(Array.from({ length: 4 }, () => post({ event: "paywall_viewed", reason: "trial_expired" })));
    expect((await events()).filter(e => e.event === "paywall_viewed")).toHaveLength(1);
  });
  it("correlates cancel returns with owned checkout interval and deduplicates per attempt", async () => {
    await start();
    const attemptId = await createFunnelCheckout(userId, "yearly", "trial_exhausted");
    const other = `funnel_test_${randomUUID()}`; users.push(other); await start(other);
    await post({ event: "checkout_canceled", attemptId }, other);
    expect((await events(other)).some(e => e.event === "checkout_canceled")).toBe(false);
    await Promise.all([post({ event: "checkout_canceled", attemptId }), post({ event: "checkout_canceled", attemptId })]);
    expect((await events()).filter(e => e.event === "checkout_canceled")).toMatchObject([
      { interval: "yearly", reason: "trial_exhausted" },
    ]);
  });
  it("reports cohorts, interval/reason attribution, rates and actual paid interval without identifiers", async () => {
    const subjectId = await start();
    await recordFunnelEvent(subjectId, "plan_selected", "monthly", "monthly", "trial_exhausted");
    await recordFunnelEvent(subjectId, "plan_selected", "yearly", "yearly", "trial_exhausted");
    await recordFunnelEvent(subjectId, "paywall_viewed", "trial_exhausted", null, "trial_exhausted");
    await recordFunnelEvent(subjectId, "paid_activation_confirmed", "none", "yearly");
    const report = await trialFunnelReport(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    const group = report.conversion.find(r => r.selected_interval === "monthly" && r.paywall_reason === "trial_exhausted");
    expect(group).toMatchObject({ trials_started: 1, plan_selected: 1, paid_activated: 1, paid_yearly: 1, trial_to_paid_percent: "100.00" });
    expect(JSON.stringify(report)).not.toContain(subjectId);
    expect(JSON.stringify(report)).not.toContain(userId);
    await expect(trialFunnelReport(new Date("invalid"), new Date())).rejects.toThrow("from < to");
  });
  it("confirms paid activation only with a positive paid invoice, once across concurrent delivery paths", async () => {
    await start();
    const customer = `cus_funnel_${randomUUID()}`;
    const subscription = `sub_funnel_${randomUUID()}`;
    const invoice = `in_funnel_${randomUUID()}`;
    const account = `acct_funnel_${randomUUID()}`;
    stripeAccounts.push(account);
    await db.execute(sql`INSERT INTO stripe.accounts(_raw_data) VALUES(${JSON.stringify({ id: account })}::jsonb)`);
    stripeIds.push(subscription, invoice);
    await db.insert(userBillingTable).values({ userId, stripeCustomerId: customer });
    const subscriptionData = JSON.stringify({
      id: subscription, customer, status: "active", livemode: false,
      created: Math.floor(Date.now()/1000),
      items: { data: [{ price: { recurring: { interval: "month" } } }] },
      metadata: { offer: "founding_customer" },
    });
    await db.execute(sql`INSERT INTO stripe.subscriptions(_account_id,_raw_data)
      VALUES(${account},${subscriptionData}::jsonb)`);
    await confirmPaidFunnel(userId);
    expect((await events()).some(e => e.event === "paid_activation_confirmed")).toBe(false);
    const invoiceData = JSON.stringify({
      id: invoice, customer, subscription, status: "open", livemode: false,
      created: Math.floor(Date.now()/1000), amount_paid: 299,
    });
    await db.execute(sql`INSERT INTO stripe.invoices(_account_id,_raw_data)
      VALUES(${account},${invoiceData}::jsonb)`);
    await confirmPaidFunnel(userId);
    expect((await events()).some(e => e.event === "paid_activation_confirmed")).toBe(false);
    await db.execute(sql`UPDATE stripe.invoices SET _raw_data = jsonb_set(_raw_data, '{status}', '"paid"') WHERE id = ${invoice}`);
    await db.execute(sql`UPDATE stripe.invoices SET _raw_data = jsonb_set(_raw_data, '{amount_paid}', '0') WHERE id = ${invoice}`);
    await confirmPaidFunnel(userId);
    expect((await events()).some(e => e.event === "paid_activation_confirmed")).toBe(false);
    await db.execute(sql`UPDATE stripe.invoices SET _raw_data = jsonb_set(_raw_data, '{amount_paid}', '299') WHERE id = ${invoice}`);
    await db.execute(sql`UPDATE stripe.subscriptions SET _raw_data = jsonb_set(_raw_data, '{status}', '"trialing"') WHERE id = ${subscription}`);
    await confirmPaidFunnel(userId);
    expect((await events()).some(e => e.event === "paid_activation_confirmed")).toBe(false);
    await db.execute(sql`UPDATE stripe.subscriptions SET _raw_data = jsonb_set(_raw_data, '{status}', '"active"') WHERE id = ${subscription}`);
    // Current Stripe API keeps this reference in parent, without the legacy
    // top-level projected subscription value.
    await db.execute(sql`UPDATE stripe.invoices SET _raw_data =
      jsonb_set(_raw_data - 'subscription', '{parent}', ${JSON.stringify({ subscription_details: { subscription } })}::jsonb)
      WHERE id = ${invoice}`);
    await Promise.all(Array.from({ length: 5 }, () => confirmPaidFunnel(userId)));
    expect((await events()).filter(e => e.event === "paid_activation_confirmed")).toMatchObject([{ interval: "monthly" }]);
  });
  it("erases event and attempt records with the account identity mapping", async () => {
    const subjectId = await start();
    await createFunnelCheckout(userId, "monthly", null);
    await db.delete(trialFunnelSubjectsTable).where(eq(trialFunnelSubjectsTable.userId, userId));
    expect(await db.select().from(trialFunnelEventsTable).where(and(
      eq(trialFunnelEventsTable.subjectId, subjectId),
    ))).toHaveLength(0);
    const result = await db.execute(sql`SELECT count(*)::int AS n FROM trial_funnel_checkouts WHERE subject_id=${subjectId}`);
    expect(result.rows[0].n).toBe(0);
  });
});
