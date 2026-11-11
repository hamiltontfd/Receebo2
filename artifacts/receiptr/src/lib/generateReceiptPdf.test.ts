import { afterEach, describe, expect, it, vi } from "vitest";
import { setAccountLocale, type AppLocale } from "./locale";
import { generateReceiptPdf } from "./generateReceiptPdf";

const { text } = vi.hoisted(() => ({ text: vi.fn() }));
vi.mock("jspdf", () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    text = text;
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    addPage() {}
    splitTextToSize(value: string) { return [value]; }
    output() { return new Blob(["mock PDF"]); }
  },
}));

afterEach(() => { setAccountLocale(undefined); text.mockClear(); });

describe("receipt PDF display", () => {
  it.each<[AppLocale, string, number, string]>([
    ["pt-PT", "EUR", 649, "649,00 €"],
    ["pt-BR", "BRL", 3199, "R$ 3.199,00"],
    ["en", "USD", 486, "$486.00"],
    ["en", "EUR", 649, "€649.00"],
  ])("formats total, highlights, items and purchase calendar date in %s / %s", async (locale, currency, amount, expected) => {
    setAccountLocale(locale);
    await generateReceiptPdf({
      originalFileName: "fictional.png", createdAt: "2026-11-02T12:00:00Z",
      purchaseDate: "2026-11-02", currency, total: amount,
      notableItems: [{ name: "Sample", price: amount }],
      products: [{ name: "Sample", price: amount }],
    });
    const strings = text.mock.calls.map(args => args[0]);
    expect(strings.filter(value => value === expected)).toHaveLength(3);
    expect(strings).toContain(locale === "pt-BR" ? "2 de nov. de 2026" : locale === "pt-PT" ? "2 nov 2026" : "Nov 2, 2026");
  });
});
