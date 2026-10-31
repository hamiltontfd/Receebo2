import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, userBillingTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

const fixture = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: fixture.send }; } }));
vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser: async () => ({
    primaryEmailAddressId: "p", emailAddresses: [{ id: "p", emailAddress: "fixture@example.invalid" }],
  }) } },
}));
vi.mock("../stripeClient", () => ({
  getStripeSync: async () => ({
    processWebhook: async (payload: Buffer, signature: string) => {
      new Stripe("sk_test_fixture").webhooks.constructEvent(payload, signature, "whsec_fixture");
    },
  }),
  getUncachableStripeClient: vi.fn(),
}));

import * as localeModule from "./emailLocale";
import { WebhookHandlers } from "../webhookHandlers";
import { runTrialReminderSweep } from "./orphanCleanup";

let userId: string;
let customerId: string;
let localeLookup: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  userId = `trial-locale-fixture-${randomUUID()}`;
  customerId = `cus_locale_${randomUUID()}`;
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
  await db.insert(userBillingTable).values({ userId, stripeCustomerId: customerId });
  localeLookup = vi.spyOn(localeModule, "getUserEmailLocale");
  fixture.send.mockReset().mockResolvedValue({ data: { id: "synthetic" }, error: null });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(userBillingTable).where(eq(userBillingTable.userId, userId));
  vi.unstubAllEnvs();
});

async function claim() {
  const [row] = await db.select().from(userBillingTable).where(eq(userBillingTable.userId, userId));
  return row.trialReminderSentAt;
}

describe.each(["webhook", "nightly sweep"] as const)("trial locale lookup failure: %s", path => {
  async function run() {
    const trialEnd = Math.floor(Date.now() / 1000) + 86400;
    if (path === "nightly sweep") {
      // Only the Stripe projection listing is synthetic; claims use the real DB.
      const execute = vi.spyOn(db, "execute").mockResolvedValue({
        rows: [{ userId, trialEnd }],
      } as never);
      try { await runTrialReminderSweep({ dryRun: false }); }
      finally { execute.mockRestore(); }
      return;
    }
    const payload = Buffer.from(JSON.stringify({
      id: "evt_locale_fixture", type: "customer.subscription.trial_will_end",
      data: { object: { id: "sub_fixture", customer: customerId, trial_end: trialEnd, items: { data: [] } } },
    }));
    const signature = new Stripe("sk_test_fixture").webhooks.generateTestHeaderString({
      payload: payload.toString(), secret: "whsec_fixture",
    });
    await WebhookHandlers.processWebhook(payload, signature);
  }

  it("releases a rejected preference lookup and successfully retries without duplicate delivery", async () => {
    localeLookup.mockImplementation(async () => {
      expect(await claim()).toBeInstanceOf(Date);
      throw new Error("preference unavailable");
    });
    if (path === "webhook") await expect(run()).rejects.toThrow("preference unavailable");
    else await run();
    expect(await claim()).toBeNull();
    expect(fixture.send).not.toHaveBeenCalled();
    localeLookup.mockResolvedValue("pt-BR");
    await run();
    expect(await claim()).toBeInstanceOf(Date);
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.send.mock.calls[0][0].html).toContain('lang="pt-BR"');
    await run();
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });

  it("releases a false delivery result", async () => {
    localeLookup.mockResolvedValue("pt-PT");
    fixture.send.mockResolvedValue({ error: { name: "provider_unavailable" } });
    await run();
    expect(await claim()).toBeNull();
  });

  it("never clears a newer claim when its own locale lookup rejects", async () => {
    const newerClaim = new Date(Date.now() + 60000);
    localeLookup.mockImplementation(async () => {
      await db.update(userBillingTable).set({ trialReminderSentAt: newerClaim })
        .where(eq(userBillingTable.userId, userId));
      throw new Error("preference unavailable");
    });
    if (path === "webhook") await expect(run()).rejects.toThrow("preference unavailable");
    else await run();
    expect((await claim())?.getTime()).toBe(newerClaim.getTime());
    expect(fixture.send).not.toHaveBeenCalled();
  });
});
