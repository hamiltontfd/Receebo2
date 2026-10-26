import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { db, userBillingTable, legalAcceptancesTable, accountTrialsTable, trialUploadsTable } from "@workspace/db";
import { getUncachableStripeClient } from "../stripeClient";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { PRIVACY_VERSION, TERMS_VERSION } from "../lib/legalAcceptance";
import app from "../app";

// Explicit opt-in only. Uses real test-mode Stripe, Clerk, DB, hosted Checkout,
// and the ordinary running API's real signed webhook. Never mocks authentication.
const enabled = process.env.RUN_STRIPE_HOSTED_E2E === "true";
describe.skipIf(!enabled)("hosted Stripe test journey with an ordinary authenticated user", () => {
  let server: Server;
  let local: string;
  let browser: Browser;
  let userId: string;
  let customerId: string | undefined;
  let subscriptionId: string | undefined;
  beforeAll(async () => {
    if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Test Clerk credentials required");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BILLING_ENFORCE_TEST_SUBSCRIPTIONS", "true");
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ limit: 1 });
    if (!prices.data.length || prices.data[0].livemode) throw new Error("Stripe test mode required");
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((done) => server.once("listening", done));
    local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", headless: true });
    const user = await clerkClient.users.createUser({
      emailAddress: [`receebo-billing-${Date.now()}+clerk_test@example.com`],
      skipPasswordRequirement: true,
    });
    userId = user.id;
  }, 60000);
  afterAll(async () => {
    const stripe = await getUncachableStripeClient();
    if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
    if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
    if (userId) {
      await db.delete(trialUploadsTable).where(eq(trialUploadsTable.userId, userId));
      await db.delete(accountTrialsTable).where(eq(accountTrialsTable.userId, userId));
      await db.delete(userBillingTable).where(eq(userBillingTable.userId, userId));
      await db.delete(legalAcceptancesTable).where(eq(legalAcceptancesTable.userId, userId));
      await clerkClient.users.deleteUser(userId);
    }
    await browser?.close();
    if (server) await new Promise<void>((done) => server.close(() => done()));
    vi.unstubAllEnvs();
  }, 60000);
  it("completes hosted checkout, receives a real webhook and cancels through the portal", async () => {
    const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(() => Boolean((window as any).Clerk?.loaded), { timeout: 30000 });
    const signInToken = await clerkClient.signInTokens.createSignInToken({ userId, expiresInSeconds: 600 });
    await page.evaluate(async (ticket) => {
      const clerk = (window as any).Clerk;
      const result = await clerk.client.signIn.create({ strategy: "ticket", ticket });
      if (result.status !== "complete") throw new Error("Test sign-in incomplete");
      await clerk.setActive({ session: result.createdSessionId });
    }, signInToken.token);
    const token = await page.evaluate(async () => (window as any).Clerk.session.getToken());
    expect(token).toBeTruthy();
    // Requests go through the real Express app and real Clerk verification.
    const request = async (path: string, body?: object) => {
      const response = await fetch(`${local}/api${path}`, {
        method: body ? "POST" : "GET",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      expect(response.ok, `HTTP ${response.status} for ${path}`).toBe(true);
      return data;
    };
    expect(await request("/billing/subscription")).toMatchObject({ plan: "free", accessState: "not_started", ownerAccess: false });
    await page.goto(`${origin}/search`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Agree and continue" }).click();
    await page.getByTestId("banner-trial").waitFor({ timeout: 30000 });
    expect(new URL(page.url()).hostname).toBe(new URL(origin).hostname);
    expect(await request("/billing/subscription")).toMatchObject({
      plan: "trialing", accessState: "account_trial", trialUploadsRemaining: 3,
      foundingEligible: true, hasBillingAccount: false,
    });
    await page.screenshot({ path: "/tmp/receebo-account-trial-mobile.png" });
    // An explicit early upgrade only: the account trial never opens Checkout.
    const checkout = await request("/billing/create-checkout-session", { planType: "monthly" });
    const [billing] = await db.select().from(userBillingTable).where(eq(userBillingTable.userId, userId));
    customerId = billing.stripeCustomerId;
    await page.goto(checkout.url);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "/tmp/receebo-hosted-checkout.png" });
    // Stripe may render card fields in frames or the top-level hosted form.
    const field = async (selector: string, value: string) => {
      for (const frame of page.frames()) {
        const element = frame.locator(selector).first();
        if (await element.isVisible().catch(() => false)) { await element.fill(value); return; }
      }
      throw new Error(`Hosted Checkout field missing: ${selector}`);
    };
    await field('input[name="cardNumber"], input[autocomplete="cc-number"]', "4242424242424242");
    await field('input[name="cardExpiry"], input[autocomplete="cc-exp"]', "12/30");
    await field('input[name="cardCvc"], input[autocomplete="cc-csc"]', "123");
    await field('input[name="billingName"], input[autocomplete="cc-name"]', "Receebo Test");
    const postal = page.locator('input[name="billingPostalCode"], input[autocomplete="postal-code"]').first();
    if (await postal.isVisible()) await postal.fill("10001");
    const saveInfo = page.getByRole("checkbox", { name: /save my information/i });
    if (await saveInfo.isVisible()) await saveInfo.uncheck();
    await page.getByTestId("hosted-payment-submit-button").click();
    try {
      await page.waitForURL(`${origin}/search?checkout=success`, { timeout: 30000 });
    } catch {
      await page.screenshot({ path: "/tmp/receebo-hosted-failure.png", fullPage: true });
      throw new Error(`Hosted return did not complete; page host: ${new URL(page.url()).hostname}; alerts: ${
        (await page.getByRole("alert").allTextContents()).join(" ").slice(0, 500)}`);
    }
    await expect.poll(async () => (await getSubscriptionStatus(userId)).plan, { timeout: 60000 })
      .toBe("pro");
    const status = await getSubscriptionStatus(userId);
    expect(status.ownerAccess).not.toBe(true);
    subscriptionId = status.stripeSubscriptionId!;
    const stripe = await getUncachableStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    expect(subscription.livemode).toBe(false);
    expect(subscription.status).toBe("active");
    expect(subscription.trial_end).toBeNull();
    const portal = await request("/billing/create-portal-session", {});
    await page.goto(portal.url);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/receebo-hosted-portal.png", fullPage: true });
    try {
      await page.getByText(/cancel (plan|subscription)/i).first().click({ timeout: 15000 });
      await page.getByRole("button", { name: /cancel (plan|subscription)/i }).last().click({ timeout: 15000 });
    } catch {
      await page.screenshot({ path: "/tmp/receebo-hosted-portal-failure.png", fullPage: true });
      throw new Error(`Portal action not found: ${(await page.locator("body").innerText()).slice(0, 2000)}`);
    }
    await expect.poll(async () => {
      const sub = await stripe.subscriptions.retrieve(subscriptionId!);
      return Boolean(sub.cancel_at_period_end || sub.cancel_at);
    },
      { timeout: 30000 }).toBe(true);
    await expect.poll(async () => (await getSubscriptionStatus(userId)).cancelAtPeriodEnd,
      { timeout: 60000 }).toBe(true);
    expect((await request("/billing/subscription")).plan).toBe("pro");
    await context.close();
  }, 180000);
});
