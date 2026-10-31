import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(), user: vi.fn(), preference: vi.fn(),
}));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("@clerk/express", () => ({ clerkClient: { users: { getUser: mocks.user } } }));
vi.mock("@workspace/db", () => ({
  userPreferencesTable: { language: "language", userId: "user_id" },
  db: { select: () => ({ from: () => ({ where: mocks.preference }) }) },
}));

import { getUserEmailLocale, resolveEmailLocale, type EmailLocale } from "./emailLocale";
import { formatEmailDate, formatMoney } from "./emailFormat";
import {
  getDeletionConfirmationContact, sendAccountDeletedEmail, sendDeletionCodeEmail,
  sendDeletionWarningEmail, sendPaymentAttentionEmail, sendReturnWindowEmail,
  sendTrialEndingEmail, sendWarrantyReminderEmail,
  renderDeletionCodeEmail, renderDeletionWarningEmail, renderAccountDeletedEmail,
} from "./emailService";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SESSION_SECRET", "synthetic-email-test-secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
  mocks.user.mockReset().mockResolvedValue({
    firstName: "<Ana>", primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: "synthetic@example.invalid" }],
  });
  mocks.send.mockReset().mockResolvedValue({ data: { id: "synthetic" }, error: null });
  mocks.preference.mockReset().mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("email locale resolution without a browser", () => {
  it.each([null, undefined, "", "es", "pt", "en-US", "EN", { market: "BR" }])("defaults %j to English", language => {
    expect(resolveEmailLocale(language)).toBe("en");
  });
  it.each(["en", "pt-PT", "pt-BR"] as const)("accepts %s", language => {
    expect(resolveEmailLocale(language)).toBe(language);
  });
  it("reads account preference afresh and never derives it from market", async () => {
    mocks.preference.mockResolvedValueOnce([{ language: "pt-BR", market: "PT" }])
      .mockResolvedValueOnce([{ language: "pt-PT", market: "BR" }])
      .mockResolvedValueOnce([{ language: null, market: "BR" }]);
    expect(await getUserEmailLocale("user")).toBe("pt-BR");
    expect(await getUserEmailLocale("user")).toBe("pt-PT");
    expect(await getUserEmailLocale("user")).toBe("en");
  });
  it("does not send on preference read failure or for a guest", async () => {
    mocks.preference.mockRejectedValueOnce(new Error("preference unavailable"));
    await expect(sendTrialEndingEmail("user", new Date("2026-12-12"))).rejects.toThrow("preference unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await sendTrialEndingEmail("guest_synthetic", new Date())).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe.each(["en", "pt-PT", "pt-BR"] as const)("all account-owned messages: %s", locale => {
  it("localizes delivery, links, dates and original currencies without real mail", async () => {
    mocks.preference.mockResolvedValue([{ language: locale }]);
    const purchase = {
      id: 15, merchant: "<Loja & Co>", total: 449, currency: "EUR",
      notableItems: [{ name: "<Produto>" }], purchaseDate: "2026-12-01",
    };
    const deadline = new Date("2026-12-12T00:00:00Z");
    await sendWarrantyReminderEmail("user", {
      ...purchase, kind: "manufacturer", expiresOn: "2026-12-12",
      other: { kind: "legal", expiresOn: "2027-12-12" },
    });
    await sendReturnWindowEmail("user", { ...purchase, deadlineDate: deadline, daysRemaining: 2, basis: "law", windowDays: 7 });
    await sendTrialEndingEmail("user", deadline, { planAmount: 999, planCurrency: "USD", planName: "<Plano>" });
    await sendPaymentAttentionEmail("user", "invoice_synthetic", { owner: false, continuesUntil: deadline });
    await sendDeletionWarningEmail("user", { stage: "30d", deletionDate: deadline, receiptCount: 2 });
    await sendDeletionWarningEmail("user", { stage: "7d", deletionDate: deadline, receiptCount: 1 });
    await sendDeletionCodeEmail("user", { email: "synthetic@example.invalid" }, { code: "482913", expiresAt: deadline, expiresInMinutes: 15 });
    const contact = await getDeletionConfirmationContact("user");
    expect(contact?.locale).toBe(locale);
    const readsBeforeDeletion = mocks.preference.mock.calls.length;
    mocks.preference.mockRejectedValue(new Error("account already deleted"));
    await sendAccountDeletedEmail("user", contact!, "inactive");
    await sendAccountDeletedEmail("user", contact!, "requested");
    expect(mocks.preference).toHaveBeenCalledTimes(readsBeforeDeletion);
    expect(mocks.send).toHaveBeenCalledTimes(9);
    const sent = mocks.send.mock.calls.map(([payload]) => payload);
    for (const payload of sent) {
      expect(payload.html).toContain(`<html lang="${locale}">`);
      expect(payload.text).toBeTruthy();
      expect(payload.html).not.toContain("<Ana>");
      expect(payload.html).not.toContain("<Produto>");
      expect(payload.html).not.toContain("<Loja & Co>");
      expect(payload.html).not.toMatch(/href="https?:\/\/(?!receebo\.net)/);
    }
    expect(sent[0].html).toContain("&lt;Produto&gt;");
    expect(sent[0].text).toContain(formatMoney(449, "EUR", locale));
    expect(sent[0].text).toContain(formatEmailDate(deadline, locale));
    expect(sent[0].text).toContain(formatEmailDate("2027-12-12", locale));
    expect(sent[1].text).toContain(locale === "en" ? "7-day" : "7 dias");
    expect(sent[2].text).toContain(formatMoney(9.99, "USD", locale));
    expect(sent[3].text).toContain(locale === "en" ? deadline.toUTCString() : deadline.toISOString());
    const settings = locale === "en" ? "settings" : locale === "pt-PT" ? "definições" : "configurações";
    expect(sent[0].html).toContain(settings);
    expect(sent[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    for (const payload of sent.slice(2)) expect(payload.headers).toBeUndefined();
    expect(sent[6].subject).not.toContain("482913");
    expect(sent[6].html).toContain("482913");
    expect(sent[6].html).toContain(locale === "en" ? "15 minutes" : "15 minutos");
    expect(mocks.send.mock.calls[3][1]).toEqual({ idempotencyKey: "payment-attention/invoice_synthetic" });
    if (locale !== "en") {
      for (const payload of sent) {
        expect(payload.html).not.toMatch(/Questions\? Email|View receipt|Manage reminders|Your account|Your code|Unsubscribe/);
      }
      expect(sent[0].subject).toContain("Garantia do fabricante");
      expect(sent[1].subject).toContain("devolução");
    }
  });

  it.each([0, 1, 3])("handles %i days and optional plan data", async days => {
    mocks.preference.mockResolvedValue([{ language: locale }]);
    const end = new Date(Date.now() + days * 86400000);
    await sendTrialEndingEmail("user", end);
    await sendReturnWindowEmail("user", { id: 1, deadlineDate: end, daysRemaining: days, basis: "store", merchant: "Loja" });
    const when = days === 0 ? (locale === "en" ? "today" : "hoje")
      : days === 1 ? (locale === "en" ? "tomorrow" : "amanhã")
        : locale === "en" ? "in 3 days" : "em 3 dias";
    expect(mocks.send.mock.calls[0][0].subject).toContain(when);
    const returned = mocks.send.mock.calls[1][0];
    expect(returned.subject).toContain(days === 0 && locale === "en" ? "Last day" : when);
    expect(returned.text).toContain(locale === "en" ? "return policy" : "política de devolução");
    expect(returned.text).not.toContain("undefined");
    expect(returned.text).not.toContain("null");
  });

  it("keeps deletion code out of subject and preheader and escapes inserted values", () => {
    const result = renderDeletionCodeEmail({ code: "123456", expiresInMinutes: 15, locale });
    const preheader = result.html.match(/display:none[^>]*>(.*?)<\/div>/)?.[1];
    expect(preheader).toBeTruthy();
    expect(preheader).not.toContain("123456");
    expect(result.subject).not.toContain("123456");
    expect(result.html).not.toMatch(/<a [^>]*href="https?:/);
    for (const rendered of [
      renderDeletionWarningEmail({ stage: "30d", deletionDate: new Date("2026-12-12"), receiptCount: 1, firstName: "<script>", locale }),
      renderAccountDeletedEmail({ reason: "requested", firstName: "<script>", locale }),
    ]) {
      expect(rendered.html).not.toContain("<script>");
      expect(rendered.html).toContain("&lt;script&gt;");
    }
  });
});

it.each(["en", "pt-PT", "pt-BR"] as EmailLocale[])("does not mutate dates/currency across language %s", locale => {
  const timestamp = new Date("2026-12-12T23:59:00Z");
  const before = timestamp.toISOString();
  expect(formatEmailDate(timestamp, locale)).toContain("2026");
  expect(formatEmailDate("not-a-date", locale)).toBeNull();
  expect(formatMoney(449, "BRL", locale)).toBe(new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, { style: "currency", currency: "BRL" }).format(449));
  expect(timestamp.toISOString()).toBe(before);
});
