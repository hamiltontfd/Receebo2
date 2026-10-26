import { beforeEach, describe, expect, it, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: request }));
import { recordCheckoutCancellation, trackTrialInteraction } from "./trialFunnel";

beforeEach(() => {
  request.mockReset().mockResolvedValue(undefined);
  window.history.replaceState({}, "", "/search");
});
describe("trial funnel browser interactions", () => {
  it("sends only the fixed interaction payload to the dedicated API", async () => {
    await trackTrialInteraction({ event: "paywall_viewed", reason: "trial_expired" });
    expect(request).toHaveBeenCalledWith("/api/billing/trial-funnel", expect.objectContaining({
      body: '{"event":"paywall_viewed","reason":"trial_expired"}',
    }));
  });
  it("acknowledges a cancel return once, preserving unrelated navigation parameters", async () => {
    window.history.replaceState({}, "", "/search?checkout=cancel&attempt=opaque&q=kept");
    await recordCheckoutCancellation();
    await recordCheckoutCancellation();
    expect(request).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?q=kept");
  });
  it("does not treat a success URL or an ordinary visit as cancellation or paid activation", async () => {
    await recordCheckoutCancellation();
    window.history.replaceState({}, "", "/search?checkout=success");
    await recordCheckoutCancellation();
    expect(request).not.toHaveBeenCalled();
  });
  it("never blocks the app and preserves the cancel marker for retry on failure", async () => {
    request.mockRejectedValue(new Error("offline"));
    window.history.replaceState({}, "", "/search?checkout=cancel&attempt=opaque");
    await expect(recordCheckoutCancellation()).resolves.toBeUndefined();
    expect(window.location.search).toContain("checkout=cancel");
  });
});
