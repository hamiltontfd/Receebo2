import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), user: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("@clerk/express", () => ({ clerkClient: { users: { getUser: mocks.user } } }));
vi.mock("./emailLocale", async importOriginal => ({
  ...await importOriginal<typeof import("./emailLocale")>(),
  getUserEmailLocale: async () => "en",
}));
import { sendPaymentAttentionEmail } from "./emailService";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  mocks.user.mockResolvedValue({ primaryEmailAddressId: "primary", emailAddresses: [
    { id: "primary", emailAddress: "test@example.com" },
  ] });
  mocks.send.mockReset().mockResolvedValue({ data: { id: "email" }, error: null });
});
describe("payment attention email delivery", () => {
  it("links only to signed-in Settings on the trusted origin and uses an invoice-scoped provider key", async () => {
    vi.stubEnv("REPLIT_DEV_DOMAIN", "untrusted.example");
    await sendPaymentAttentionEmail("user_paid", "in_renewal", { owner: false, continuesUntil: new Date("2026-12-12T12:00:00Z") });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "test@example.com",
      html: expect.stringContaining('href="https://receebo.net/settings"'),
      text: expect.stringContaining("choose Update payment details"),
    }), { idempotencyKey: "payment-attention/in_renewal" });
    expect(mocks.send.mock.calls[0][0].html).not.toContain("untrusted.example");
  });
  it("fails explicitly on provider-returned errors (not only thrown errors)", async () => {
    mocks.send.mockResolvedValue({ error: { name: "rate_limit_exceeded" } });
    await expect(sendPaymentAttentionEmail("user_paid", "in_renewal", { owner: false, continuesUntil: null }))
      .rejects.toThrow("Payment notice delivery failed");
  });
  it("does not report delivery for missing recipients or failed auth lookup", async () => {
    mocks.user.mockRejectedValue(new Error("Clerk unavailable"));
    await expect(sendPaymentAttentionEmail("user_paid", "in_renewal", { owner: false, continuesUntil: null }))
      .rejects.toThrow("recipient unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
