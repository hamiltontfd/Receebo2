import express from "express";
import Stripe from "stripe";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  billing: null as null | { userId: string; stripeCustomerId: string; stripeSubscriptionId?: string },
  subscription: null as null | {
    id: string; status: string; trial_end: number; current_period_end: number;
    cancel_at_period_end: boolean; cancel_at?: number | null;
  },
  customer: vi.fn(),
  price: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser: async (id: string) => ({
    id, primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: "ordinary@example.invalid",
      verification: { status: "verified" } }],
    externalAccounts: [],
  }) } },
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-user"]) return res.sendStatus(401);
    req.userId = req.headers["x-test-user"];
    next();
  },
}));
vi.mock("../lib/legalAcceptance", () => ({
  requireCurrentLegalAcceptance: (req: any, res: any, next: any) =>
    req.headers["x-test-consent"] === "accepted" ? next() : res.sendStatus(428),
}));
vi.mock("../lib/userDataLock", () => ({ lockUserDataMutation: (handler: any) => handler }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/emailService", () => ({ sendTrialEndingEmail: vi.fn() }));
vi.mock("../stripeClient", () => ({
  getUncachableStripeClient: async () => ({
    customers: { create: state.customer },
    prices: { retrieve: state.price },
    checkout: { sessions: { create: state.checkout } },
    billingPortal: { sessions: { create: state.portal } },
  }),
  getStripeSync: async () => ({ processWebhook: state.sync }),
}));
vi.mock("@workspace/db", () => ({
  userBillingTable: {
    userId: "userId", stripeCustomerId: "stripeCustomerId", stripeSubscriptionId: "stripeSubscriptionId",
  },
  db: {
    select: () => ({ from: () => ({ where: async () => state.billing ? [state.billing] : [] }) }),
    insert: () => ({ values: (values: any) => ({
      onConflictDoUpdate: () => ({ returning: async () => {
        state.billing = values;
        return [values];
      } }),
    }) }),
    update: () => ({ set: (values: any) => ({ where: async () => {
      if (state.billing) Object.assign(state.billing, values);
    } }) }),
    execute: async () => ({ rows: state.subscription ? [state.subscription] : [] }),
  },
}));

import billingRouter from "./billing";
import { WebhookHandlers } from "../webhookHandlers";

// Only local fixtures: no API requests, real credentials, database, or charges.
const verifier = new Stripe("sk_test_local_fixture_only");
const signingSecret = "whsec_local_fixture_only";
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      await WebhookHandlers.processWebhook(req.body, String(req.headers["stripe-signature"] ?? ""));
      res.sendStatus(200);
    } catch { res.sendStatus(400); }
  });
  app.use(express.json(), billingRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production"); // Exercise the real paywall, not the dev bypass.
  vi.stubEnv("REPLIT_DEV_DOMAIN", "workspace.janeway.replit.dev");
  vi.stubEnv("STRIPE_MONTHLY_PRICE_ID", "price_monthly_fixture");
  vi.stubEnv("STRIPE_YEARLY_PRICE_ID", "price_yearly_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
  for (const mode of ["LIVE", "TEST"]) {
    for (const period of ["MONTHLY", "YEARLY"]) vi.stubEnv(`STRIPE_${mode}_${period}_PRICE_ID`, "");
    vi.stubEnv(`STRIPE_${mode}_PORTAL_CONFIGURATION_ID`, "");
  }
  state.billing = null;
  state.subscription = null;
  vi.clearAllMocks();
  state.customer.mockResolvedValue({ id: "cus_fixture" });
  state.price.mockImplementation(async (id: string) => ({
    active: true, livemode: process.env.NODE_ENV === "production", currency: "eur",
    unit_amount: id.includes("yearly") ? 2499 : 299,
    recurring: { interval: id.includes("yearly") ? "year" : "month", interval_count: 1 },
  }));
  state.checkout.mockResolvedValue({ url: "https://checkout.stripe.com/c/test_fixture" });
  state.portal.mockResolvedValue({ url: "https://billing.stripe.com/p/session/test_fixture" });
  // Model the external sync adapter only. App handlers and entitlement logic are real.
  state.sync.mockImplementation(async (payload: Buffer, signature: string) => {
    const event = verifier.webhooks.constructEvent(payload, signature, signingSecret);
    if (event.type.startsWith("customer.subscription.")) {
      state.subscription = event.data.object as any;
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

function post(path: string, body = {}, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": "ordinary_user",
      "x-test-consent": "accepted", ...headers },
    body: JSON.stringify(body),
  });
}
async function status() {
  const response = await fetch(`${base}/billing/subscription`, {
    headers: { "x-test-user": "ordinary_user" },
  });
  expect(response.status).toBe(200);
  return response.json();
}
async function event(type: string, object: object, valid = true) {
  const payload = JSON.stringify({ id: "evt_fixture", type, data: { object } });
  const signature = verifier.webhooks.generateTestHeaderString({
    payload, secret: valid ? signingSecret : "whsec_wrong_fixture",
  });
  return fetch(`${base}/stripe/webhook`, {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
}
function subscription(overrides = {}) {
  const end = Math.floor(Date.now() / 1000) + 7 * 86400;
  return {
    id: "sub_fixture", customer: "cus_fixture", status: "trialing",
    trial_end: end, current_period_end: end, cancel_at_period_end: false, ...overrides,
  };
}

describe("ordinary user billing, with isolated Stripe and database adapters", () => {
  it.each(["monthly", "yearly"])("creates %s checkout with canonical success and cancellation returns", async (planType) => {
    const response = await post("/billing/create-checkout-session", {
      planType, success_url: "https://evil.invalid", return_url: "https://evil.invalid",
    }, { host: "evil.invalid", origin: "https://evil.invalid", "x-forwarded-host": "evil.invalid" });
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("url", "https://checkout.stripe.com/c/test_fixture");
    expect(state.checkout).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_fixture", mode: "subscription",
      line_items: [{ price: `price_${planType}_fixture`, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: "https://receebo.net/search?checkout=success",
      cancel_url: "https://receebo.net/search?checkout=cancel",
    }));
    expect(state.billing?.userId).toBe("ordinary_user");
  });
  it("keeps development checkout and portal returns in the preview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await post("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(200);
    expect(state.checkout).toHaveBeenCalledWith(expect.objectContaining({
      success_url: "https://workspace.janeway.replit.dev/search?checkout=success",
      cancel_url: "https://workspace.janeway.replit.dev/search?checkout=cancel",
    }));
    expect((await post("/billing/create-portal-session")).status).toBe(200);
    expect(state.portal).toHaveBeenCalledWith(expect.objectContaining({
      return_url: "https://workspace.janeway.replit.dev/settings",
    }));
  });
  it("returns production portal users to settings regardless of supplied host or body", async () => {
    state.billing = { userId: "ordinary_user", stripeCustomerId: "cus_fixture" };
    expect((await post("/billing/create-portal-session", { return_url: "https://evil.invalid" },
      { host: "evil.invalid" })).status).toBe(200);
    expect(state.portal).toHaveBeenCalledWith({
      customer: "cus_fixture", return_url: "https://receebo.net/settings",
    });
  });
  it("reuses an existing customer without creating another", async () => {
    state.billing = { userId: "ordinary_user", stripeCustomerId: "cus_fixture" };
    expect((await post("/billing/create-checkout-session", { planType: "yearly" })).status).toBe(200);
    expect(state.customer).not.toHaveBeenCalled();
  });
  it("fails before creating Stripe resources when development origin is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REPLIT_DEV_DOMAIN", "");
    expect((await post("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(500);
    expect(state.customer).not.toHaveBeenCalled();
    expect(state.checkout).not.toHaveBeenCalled();
  });
  it("rejects a mixed-mode price without creating a Stripe customer", async () => {
    state.price.mockResolvedValueOnce({ active: true, livemode: false });
    expect((await post("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(503);
    expect(state.customer).not.toHaveBeenCalled();
    expect(state.checkout).not.toHaveBeenCalled();
  });
  it("prefers mode-specific prices and portal settings over shared legacy values", async () => {
    vi.stubEnv("STRIPE_LIVE_MONTHLY_PRICE_ID", "price_monthly_live_fixture");
    vi.stubEnv("STRIPE_LIVE_PORTAL_CONFIGURATION_ID", "bpc_live_fixture");
    expect((await post("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(200);
    expect(state.price).toHaveBeenCalledWith("price_monthly_live_fixture");
    expect((await post("/billing/create-portal-session")).status).toBe(200);
    expect(state.portal).toHaveBeenCalledWith(expect.objectContaining({ configuration: "bpc_live_fixture" }));
  });
  it("requires authentication and consent, and validates plan configuration", async () => {
    expect((await post("/billing/create-checkout-session", { planType: "monthly" },
      { "x-test-user": "" })).status).toBe(401);
    expect((await post("/billing/create-checkout-session", { planType: "monthly" },
      { "x-test-consent": "" })).status).toBe(428);
    expect((await post("/billing/create-checkout-session", { planType: "bad" })).status).toBe(400);
    vi.stubEnv("STRIPE_MONTHLY_PRICE_ID", "");
    expect((await post("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(503);
    expect(state.checkout).not.toHaveBeenCalled();
  });
  it("does not offer a portal without a billing account and reports Stripe failure", async () => {
    expect((await post("/billing/create-portal-session")).status).toBe(404);
    state.billing = { userId: "ordinary_user", stripeCustomerId: "cus_fixture" };
    state.portal.mockRejectedValueOnce(new Error("Portal not configured"));
    expect((await post("/billing/create-portal-session")).status).toBe(500);
  });
  it("moves a normal user from free to trial and through portal cancellation to expired access", async () => {
    expect(await status()).toMatchObject({ plan: "free" });
    expect((await post("/billing/create-checkout-session", { planType: "monthly" })).status).toBe(200);
    expect(await status()).toMatchObject({ plan: "free" }); // Redirect alone never grants access.
    expect((await event("checkout.session.completed",
      { customer: "cus_fixture", subscription: "sub_fixture" })).status).toBe(200);
    expect(state.billing?.stripeSubscriptionId).toBe("sub_fixture");
    expect((await event("customer.subscription.created", subscription())).status).toBe(200);
    expect(await status()).toMatchObject({ plan: "trialing", ownerAccess: false });
    expect((await post("/billing/create-portal-session")).status).toBe(200);
    expect((await event("customer.subscription.updated",
      subscription({ cancel_at_period_end: true }))).status).toBe(200);
    expect(await status()).toMatchObject({ plan: "trialing", cancelAtPeriodEnd: true });
    expect((await event("customer.subscription.updated", subscription({
      cancel_at_period_end: false, cancel_at: Math.floor(Date.now() / 1000) + 7 * 86400,
    }))).status).toBe(200);
    expect(await status()).toMatchObject({ plan: "trialing", cancelAtPeriodEnd: true });
    const expired = Math.floor(Date.now() / 1000) - 60;
    expect((await event("customer.subscription.deleted",
      subscription({ status: "canceled", trial_end: expired, current_period_end: expired }))).status).toBe(200);
    expect(await status()).toMatchObject({ plan: "free" });
  });
  it("grants active subscription access after successful renewal", async () => {
    state.billing = { userId: "ordinary_user", stripeCustomerId: "cus_fixture" };
    expect((await event("customer.subscription.updated", subscription({ status: "active" }))).status).toBe(200);
    expect((await event("invoice.paid", {
      customer: "cus_fixture", parent: { subscription_details: { subscription: "sub_fixture" } },
    })).status).toBe(200);
    expect(await status()).toMatchObject({ plan: "pro", ownerAccess: false });
  });
  it("rejects an invalid signature before updating customer access", async () => {
    state.billing = { userId: "ordinary_user", stripeCustomerId: "cus_fixture" };
    expect((await event("customer.subscription.created", subscription(), false)).status).toBe(400);
    expect(await status()).toMatchObject({ plan: "free" });
    expect(state.billing.stripeSubscriptionId).toBeUndefined();
  });
});
