import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), user: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("@clerk/express", () => ({ clerkClient: { users: { getUser: mocks.user } } }));
import * as emailService from "./emailService";
import {
  appUrl, emailSender, escapeHtml, sanitizeSubject, formatMoney, formatEmailDate,
  renderEmailLayout, sendWarrantyReminderEmail, sendReturnWindowEmail, sendTrialEndingEmail,
  parseUnsubscribeToken, generateUnsubscribeToken, SUBJECT_MAX_LENGTH, DEFAULT_EMAIL_FROM,
} from "./emailService";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("REPLIT_DEV_DOMAIN", "");
  vi.stubEnv("RESEND_FROM", "");
  vi.stubEnv("RESEND_REPLY_TO", "");
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  mocks.user.mockResolvedValue({ primaryEmailAddressId: "p", emailAddresses: [{ id: "p", emailAddress: "u@example.com" }] });
  mocks.send.mockReset().mockResolvedValue({ data: { id: "email_1" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

const warranty = { id: 7, merchant: "Worten", warranty: "2 years until 2026-11-25" };
const returnWindow = { id: 8, merchant: "Zara", deadlineDate: new Date("2026-10-28T00:00:00Z"), daysRemaining: 2 };

describe("email links and sender", () => {
  it("links to receebo.net in production even if a dev domain is present", () => {
    expect(appUrl({ NODE_ENV: "production", REPLIT_DEV_DOMAIN: "x.picard.replit.dev" })).toBe("https://receebo.net");
    expect(appUrl({ NODE_ENV: "development", REPLIT_DEV_DOMAIN: "abc.picard.replit.dev" })).toBe("https://abc.picard.replit.dev");
    expect(appUrl({ NODE_ENV: "development", REPLIT_DEV_DOMAIN: "evil.example" })).toBe("https://receebo.net");
  });
  it("keeps the current sender by default and supports RESEND_FROM / RESEND_REPLY_TO", () => {
    expect(DEFAULT_EMAIL_FROM).toBe("onboarding@resend.dev");
    expect(emailSender({})).toEqual({ from: "onboarding@resend.dev" });
    expect(emailSender({ RESEND_FROM: "Receebo <hello@receebo.net>", RESEND_REPLY_TO: "support@receebo.net" }))
      .toEqual({ from: "Receebo <hello@receebo.net>", replyTo: "support@receebo.net" });
  });
  it("sends Reply-To only when configured", async () => {
    await sendWarrantyReminderEmail("user_1", warranty);
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty("replyTo");
    expect(mocks.send.mock.calls[0][0].from).toBe("onboarding@resend.dev");
    vi.stubEnv("RESEND_REPLY_TO", "support@receebo.net");
    await sendWarrantyReminderEmail("user_1", warranty);
    expect(mocks.send.mock.calls[1][0].replyTo).toBe("support@receebo.net");
  });
  it("no longer has a per-receipt 'receipt ready' email", () => {
    expect("sendReceiptReadyEmail" in emailService).toBe(false);
  });
});

describe("delivery results", () => {
  it("reports Resend-returned errors as failures (not only thrown errors)", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "testing sender" } });
    expect(await sendWarrantyReminderEmail("user_1", warranty)).toBe(false);
    expect(await sendReturnWindowEmail("user_1", returnWindow)).toBe(false);
    expect(await sendTrialEndingEmail("user_1", new Date(Date.now() + 86_400_000))).toBe(false);
    mocks.send.mockRejectedValue(new Error("network"));
    expect(await sendWarrantyReminderEmail("user_1", warranty)).toBe(false);
    mocks.send.mockResolvedValue({ data: { id: "ok" }, error: null });
    expect(await sendWarrantyReminderEmail("user_1", warranty)).toBe(true);
  });
  it("does not send without a recipient", async () => {
    mocks.user.mockRejectedValue(new Error("Clerk down"));
    expect(await sendReturnWindowEmail("user_1", returnWindow)).toBe(false);
    expect(await sendWarrantyReminderEmail("guest_abc", warranty)).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("escaping and subjects", () => {
  it("escapes user/AI-derived text in HTML", async () => {
    await sendWarrantyReminderEmail("user_1", {
      id: 1, merchant: `"><a href="https://evil.test">Win</a>`, warranty: "<script>alert(1)</script> until 2026-11-25",
    });
    const { html } = mocks.send.mock.calls[0][0];
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<a href="https://evil.test"');
    expect(html).toContain("&lt;script&gt;");
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
  it("strips newlines and caps subject length", async () => {
    expect(sanitizeSubject("Hello\r\nBcc: x@y.z")).toBe("Hello Bcc: x@y.z");
    expect(sanitizeSubject("a".repeat(500)).length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
    await sendReturnWindowEmail("user_1", { ...returnWindow, notableItemName: `Shoes\nX-Injected: 1 ${"z".repeat(300)}` });
    const { subject } = mocks.send.mock.calls[0][0];
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
  });
});

describe("unsubscribe", () => {
  it("adds one-click List-Unsubscribe headers and a footer link to warranty and return emails", async () => {
    await sendWarrantyReminderEmail("user_1", warranty);
    await sendReturnWindowEmail("user_1", returnWindow);
    for (const [msg] of mocks.send.mock.calls) {
      expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      const url = msg.headers["List-Unsubscribe"].slice(1, -1);
      expect(url.startsWith("https://receebo.net/api/notifications/unsubscribe?token=")).toBe(true);
      expect(parseUnsubscribeToken(decodeURIComponent(url.split("token=")[1]))).toBe("user_1");
      expect(msg.html).toContain(">Unsubscribe</a> from warranty and return reminders");
      expect(msg.html).toContain('href="https://receebo.net/receipts/');
    }
  });
  it("rejects tampered tokens", () => {
    const token = generateUnsubscribeToken("user_1");
    expect(parseUnsubscribeToken(token)).toBe("user_1");
    expect(parseUnsubscribeToken(`${token}x`)).toBeNull();
    expect(parseUnsubscribeToken(token.replace(/^[^.]+/, Buffer.from("user_2").toString("base64url")))).toBeNull();
  });
});

describe("formatting and layout", () => {
  it("formats money and dates for UK/EU readers", async () => {
    expect(formatMoney(12.5, "EUR")).toBe("€12.50");
    expect(formatMoney(3, "gbp")).toBe("£3.00");
    expect(formatMoney(9.99, null)).toBe("9.99");
    expect(formatMoney(9.99, "XQQ1")).toBe("9.99 XQQ1");
    expect(formatEmailDate("2026-10-26")).toBe("26 Oct 2026");
    expect(formatEmailDate(new Date("2026-03-01T23:30:00Z"))).toBe("1 Mar 2026");
    await sendReturnWindowEmail("user_1", returnWindow);
    expect(mocks.send.mock.calls[0][0].html).toContain("28 Oct 2026");
    await sendTrialEndingEmail("user_1", new Date("2030-01-05T00:00:00Z"), { planAmount: 299, planCurrency: "eur", planName: "Monthly" });
    expect(mocks.send.mock.calls[1][0].html).toContain("€2.99");
    expect(mocks.send.mock.calls[1][0].html).toContain("5 Jan 2030");
  });
  it("renders the shared layout with header, content, button and footer slots", () => {
    const html = renderEmailLayout({
      eyebrow: "Receebo <News>", bodyHtml: "<p>Body</p>", cta: { label: "Open", href: "https://receebo.net/x?a=1&b=2" },
      footerHtml: "Why you got this.", unsubscribeUrl: "https://receebo.net/u",
    });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("Receebo &lt;News&gt;");
    expect(html).toContain("<p>Body</p>");
    expect(html).toContain('href="https://receebo.net/x?a=1&amp;b=2"');
    expect(html).toContain("Why you got this.");
    expect(html).toContain('href="https://receebo.net/u"');
    expect(renderEmailLayout({ eyebrow: "Receebo", bodyHtml: "<p>x</p>" })).not.toContain("border-top");
  });
});
