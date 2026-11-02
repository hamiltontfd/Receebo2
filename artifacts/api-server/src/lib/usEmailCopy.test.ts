/** US mode G: en-US dates and money in English reminders (email + push) for US-market accounts; PT copy unchanged. */
import { describe, expect, it } from "vitest";
import { formatEmailDate, formatMoney } from "./emailFormat";
import { renderReturnReminder, renderWarrantyReminder } from "./reminderCopy";
import { localizedReturnReminder } from "./reminderEmailCopy";
import { renderDeletionWarningEmail } from "./emailService";

const tv = {
  merchant: "Best Buy", total: 1299.99, currency: "USD", purchaseDate: "2026-11-27",
  products: [{ name: 'LG 65" OLED TV', price: 1299.99 }],
};

describe("formatting", () => {
  it("en-US: 'Nov 27, 2028' and '$1,299.99' (never 'US$'); other currencies keep their symbol", () => {
    expect(formatEmailDate("2028-11-27", "en-US")).toBe("Nov 27, 2028");
    expect(formatMoney(1299.99, "USD", "en-US")).toBe("$1,299.99");
    expect(formatMoney(12.5, "EUR", "en-US")).toBe("€12.50");
  });
  it("en (PT/EU accounts): unchanged", () => {
    expect(formatEmailDate("2028-11-27")).toBe("27 Nov 2028");
    expect(formatMoney(1299.99, "USD")).toBe("US$1,299.99");
    expect(formatMoney(12.5, "EUR", "en")).toBe("€12.50");
  });
});

describe("US reminder copy", () => {
  it("manufacturer warranty reminder", () => {
    const m = renderWarrantyReminder({ ...tv, region: "US", kind: "manufacturer", expiresOn: "2028-11-27" });
    expect(m).toMatchObject({
      subject: 'Manufacturer warranty for LG 65" OLED TV ($1,299.99) ends on Nov 27, 2028',
      title: 'LG 65" OLED TV: manufacturer warranty ends Nov 27, 2028',
      itemLine: 'LG 65" OLED TV · $1,299.99 · Best Buy, bought Nov 27, 2026',
      preheader: "Bought at Best Buy on Nov 27, 2026.",
      body: "If something isn't working as it should, contact the manufacturer before Nov 27, 2028. Your receipt is saved in Receebo as proof of purchase.",
      push: { title: "Manufacturer warranty ends Nov 27, 2028", body: 'LG 65" OLED TV · $1,299.99 · Best Buy' },
    });
    expect(JSON.stringify(m)).not.toMatch(/subscribed/i);
  });
  it("return reminder from the store table (holiday) and from the user's window", () => {
    const store = renderReturnReminder({ ...tv, region: "US", deadline: "2027-01-15", daysRemaining: 2, basis: "store", windowDays: 15, holiday: true });
    expect(store.subject).toBe('Return window for LG 65" OLED TV ($1,299.99) closes in 2 days');
    expect(store.title).toBe('LG 65" OLED TV: return window closes Jan 15, 2027');
    expect(store.note).toBe("Based on Best Buy's holiday return policy. Conditions vary, so check your receipt or the store's site.");
    const own = renderReturnReminder({ ...tv, region: "US", deadline: "2026-12-27", daysRemaining: 1, basis: "user", windowDays: 30 });
    expect(own.note).toBe("Based on the 30-day return window you saved for this receipt.");
    expect(own.push).toEqual({ title: "Return window closes tomorrow", body: 'LG 65" OLED TV · $1,299.99 · Best Buy' });
  });
  it("US account writing in Portuguese: pt dates, user/holiday notes translated", () => {
    const own = localizedReturnReminder({ ...tv, region: "US", deadline: "2026-12-27", daysRemaining: 1, basis: "user", windowDays: 30 }, "pt-BR");
    expect(own.note).toBe("Com base no prazo de devolução de 30 dias que você salvou para este recibo.");
    const hol = localizedReturnReminder({ ...tv, region: "US", deadline: "2027-01-15", daysRemaining: 2, basis: "store", windowDays: 15, holiday: true }, "pt-PT");
    expect(hol.note).toBe("Com base na política de devolução de fim de ano de Best Buy. As condições variam; consulte o recibo ou o site da loja.");
  });
  it("the same receipt on a PT account keeps the PT format", () => {
    const m = renderWarrantyReminder({ ...tv, kind: "manufacturer", expiresOn: "2028-11-27" });
    expect(m.subject).toBe('Manufacturer warranty for LG 65" OLED TV (US$1,299.99) ends on 27 Nov 2028');
    expect(renderWarrantyReminder({ ...tv, region: "PT", kind: "manufacturer", expiresOn: "2028-11-27" })).toEqual(m);
  });
  it("deletion warning date", () => {
    const d = new Date("2028-11-27T10:00:00Z");
    expect(renderDeletionWarningEmail({ stage: "30d", deletionDate: d, receiptCount: 3, baseUrl: "https://x", formatLocale: "en-US" }).subject)
      .toBe("Your Receebo receipts will be deleted on Nov 27, 2028");
    expect(renderDeletionWarningEmail({ stage: "30d", deletionDate: d, receiptCount: 3, baseUrl: "https://x" }).subject)
      .toBe("Your Receebo receipts will be deleted on 27 Nov 2028");
  });
});
