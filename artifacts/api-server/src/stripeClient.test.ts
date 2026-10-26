import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUncachableStripeClient } from "./stripeClient";

beforeEach(() => {
  vi.stubEnv("STRIPE_TEST_SECRET_KEY", "");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("REPLIT_CONNECTORS_HOSTNAME", "connectors.example.invalid");
  vi.stubEnv("REPL_IDENTITY", "fixture-identity");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Stripe credential isolation", () => {
  it("does not use a shared live key for development actions", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fixture");
    const fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ items: [{ settings: { secret: "sk_test_fixture" } }] }),
    });
    vi.stubGlobal("fetch", fetch);
    expect(await getUncachableStripeClient()).toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("rejects a connector's live key in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ items: [{ settings: { secret: "sk_live_fixture" } }] }),
    }));
    await expect(getUncachableStripeClient()).rejects.toThrow("test-mode");
  });
  it("rejects test credentials in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    await expect(getUncachableStripeClient()).rejects.toThrow("does not match");
  });
  it("requires an explicit production key rather than a test connector fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(getUncachableStripeClient()).rejects.toThrow("Production STRIPE_SECRET_KEY");
  });
  it("accepts an explicit test key without a connector request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRIPE_TEST_SECRET_KEY", "sk_test_fixture");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await getUncachableStripeClient()).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
