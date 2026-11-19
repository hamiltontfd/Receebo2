import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), getUser: vi.fn(), send: vi.fn(), warn: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@clerk/express", () => ({ clerkClient: { users: { getUser: mocks.getUser } } }));
vi.mock("./emailService", () => ({ sendSignupNotification: mocks.send }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn } }));
import { notifyNewTrial } from "./signupNotifyService";

const input = { userId: "SYNTHETIC_USER", at: new Date("2026-11-19T13:04:00Z"), market: "US", country: "US" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RESEND_API_KEY", "SYNTHETIC");
  vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "owner@example.invalid");
  mocks.execute.mockResolvedValue({ rows: [{ utm_source: "reddit", utm_campaign: "fixture", fbclid: "DO_NOT_SEND_RAW_CLICK" }] });
  mocks.getUser.mockResolvedValue({
    primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: "fixture@example.invalid" }],
    externalAccounts: [{ provider: "oauth_google" }],
  });
  mocks.send.mockResolvedValue({ ok: true, id: "fixture-message" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("signup enrichment uses existing account data only", () => {
  it("never sends real owner notifications for automated integration fixtures", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await notifyNewTrial(input);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("uses first touch, detected country and the probable Google method", async () => {
    await notifyNewTrial(input);
    expect(mocks.send).toHaveBeenCalledOnce();
    const [data] = mocks.send.mock.calls[0];
    expect(data).toMatchObject({ market: "US", country: "US", utmSource: "reddit", hasFbclid: true, loginMethod: "Google" });
    expect(JSON.stringify(data)).not.toContain("DO_NOT_SEND_RAW_CLICK");
    expect(data).not.toHaveProperty("userId");
    expect(mocks.warn).not.toHaveBeenCalled();
  });
  it("falls back to email for a user without a Google external account", async () => {
    mocks.getUser.mockResolvedValue({ emailAddresses: [], externalAccounts: [] });
    await notifyNewTrial(input);
    expect(mocks.send.mock.calls[0][0].loginMethod).toBe("e-mail");
  });
  it("still sends if both database and Clerk reads fail, without logging errors", async () => {
    mocks.execute.mockRejectedValue(new Error("sensitive db message"));
    mocks.getUser.mockRejectedValue(new Error("sensitive Clerk message"));
    await expect(notifyNewTrial(input)).resolves.toBeUndefined();
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ loginMethod: "desconhecido", hasFbclid: false });
    expect(mocks.send.mock.calls[0][0].utmSource).toBeUndefined();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
  it("skips all lookups when unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await notifyNewTrial(input);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ reason: "unconfigured" }, "Signup notification skipped or failed");
  });
  it("falls back after bounded slow lookups", async () => {
    vi.useFakeTimers();
    mocks.execute.mockImplementation(() => new Promise(() => {}));
    mocks.getUser.mockImplementation(() => new Promise(() => {}));
    const result = notifyNewTrial(input);
    await vi.advanceTimersByTimeAsync(1_500);
    await result;
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("never propagates a sender failure or logs the raw message", async () => {
    mocks.send.mockRejectedValue(new Error("private message"));
    await expect(notifyNewTrial(input)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ reason: "network_error" }, "Signup notification skipped or failed");
  });
});
