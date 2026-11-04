import { describe, expect, it } from "vitest";
import { returnReminderPush, warrantyReminderPush } from "./reminderEmailCopy";
import { renderReturnReminder, renderWarrantyReminder } from "./reminderCopy";

/** Intl uses no-break spaces in pt money ("1299,99\u00a0€"); compare with plain spaces. */
const nb = (s: string | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ");
const tv = { merchant: "Worten", currency: "EUR", total: 1299.99, products: [{ name: 'Televisor LG OLED 65"', price: 1299.99 }] };

describe("reminder push copy per account language", () => {
  it("English is the existing copy, unchanged (PT and US accounts)", () => {
    const ret = { ...tv, deadline: "2027-01-04", daysRemaining: 2 };
    expect(returnReminderPush(ret, "en")).toEqual(renderReturnReminder(ret).push);
    const us = { ...tv, region: "US", currency: "USD", deadline: "2027-01-04", daysRemaining: 1 };
    expect(returnReminderPush(us, "en")).toEqual(renderReturnReminder(us).push);
    const w = { ...tv, kind: "manufacturer" as const, expiresOn: "2028-11-27" };
    expect(warrantyReminderPush(w, "en")).toEqual(renderWarrantyReminder(w).push);
  });

  it("return titles in Portuguese for 0, 1 and N days (pt-PT and pt-BR)", () => {
    for (const locale of ["pt-PT", "pt-BR"] as const) {
      expect(returnReminderPush({ ...tv, deadline: "2027-01-04", daysRemaining: 0 }, locale).title).toBe("Último dia para devolver");
      expect(returnReminderPush({ ...tv, deadline: "2027-01-04", daysRemaining: 1 }, locale).title).toBe("O prazo de devolução termina amanhã");
      expect(returnReminderPush({ ...tv, deadline: "2027-01-04", daysRemaining: 2 }, locale).title).toBe("O prazo de devolução termina em 2 dias");
    }
  });

  it("body: product · amount (Portuguese number format) · store, cut to the push length", () => {
    const body = returnReminderPush({ ...tv, deadline: "2027-01-04", daysRemaining: 1 }, "pt-PT").body;
    expect(nb(body)).toBe('Televisor LG OLED 65" · 1299,99 € · Worten');
    const long = returnReminderPush({ ...tv, products: [{ name: "Máquina de lavar roupa Samsung EcoBubble 9 kg classe A", price: 1 }], deadline: "2027-01-04", daysRemaining: 1 }, "pt-BR").body;
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).toContain("…");
  });

  it("no product name: 'Compra em {store}', else 'A sua compra' (pt-PT) / 'Sua compra' (pt-BR)", () => {
    const noItem = { merchant: "Continente", currency: "EUR", total: 12.5, products: [], deadline: "2027-01-04", daysRemaining: 1 };
    expect(nb(returnReminderPush(noItem, "pt-PT").body)).toBe("Compra em Continente · 12,50 €");
    expect(returnReminderPush({ ...noItem, merchant: null, total: null }, "pt-PT").body).toBe("A sua compra");
    expect(returnReminderPush({ ...noItem, merchant: null, total: null }, "pt-BR").body).toBe("Sua compra");
  });

  it("warranty titles in Portuguese with the long date", () => {
    expect(warrantyReminderPush({ ...tv, kind: "legal", expiresOn: "2029-01-04" }, "pt-PT").title).toBe("Garantia legal termina em 4 de janeiro de 2029");
    expect(warrantyReminderPush({ ...tv, kind: "manufacturer", expiresOn: "2028-11-27" }, "pt-BR").title).toBe("Garantia do fabricante termina em 27 de novembro de 2028");
  });
});
