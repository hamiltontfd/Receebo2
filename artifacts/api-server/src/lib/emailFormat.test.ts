import { describe, expect, it } from "vitest";
import { formatEmailDate } from "./emailFormat";
import { localizedReturnReminder, localizedWarrantyReminder } from "./reminderEmailCopy";

describe("formatEmailDate", () => {
  it("English keeps the short month (en-GB and en-US)", () => {
    expect(formatEmailDate("2027-01-04")).toBe("4 Jan 2027");
    expect(formatEmailDate("2027-01-04", "en-US")).toBe("Jan 4, 2027");
  });

  it("Portuguese uses the long form, never the ICU pt-PT short pattern 4/01/2027", () => {
    expect(formatEmailDate("2027-01-04", "pt-PT")).toBe("4 de janeiro de 2027");
    expect(formatEmailDate("2027-01-04", "pt-BR")).toBe("4 de janeiro de 2027");
    expect(formatEmailDate(new Date("2028-11-27T23:30:00Z"), "pt-PT")).toBe("27 de novembro de 2028");
    for (const locale of ["pt-PT", "pt-BR"] as const) {
      expect(formatEmailDate("2027-01-04", locale)).not.toMatch(/\d\/\d/);
    }
  });

  it("invalid input stays null", () => {
    expect(formatEmailDate("not a date", "pt-PT")).toBeNull();
  });
});

describe("Portuguese reminder emails show long dates", () => {
  const tv = { merchant: "Worten", currency: "EUR", total: 499.99, products: [{ name: "Televisor LG", price: 499.99 }], purchaseDate: "2026-12-20" };
  it("return reminder (pt-PT)", () => {
    const m = localizedReturnReminder({ ...tv, deadline: "2027-01-04", daysRemaining: 2, basis: "law", windowDays: 14 }, "pt-PT");
    expect(m.title).toBe("Televisor LG: prazo de devolução até 4 de janeiro de 2027");
    expect(m.itemLine).toContain("compra em 20 de dezembro de 2026");
  });
  it("warranty reminder (pt-BR)", () => {
    const m = localizedWarrantyReminder({ ...tv, kind: "legal", expiresOn: "2029-01-04" }, "pt-BR");
    expect(m.subject).toContain("termina em 4 de janeiro de 2029");
  });
});
