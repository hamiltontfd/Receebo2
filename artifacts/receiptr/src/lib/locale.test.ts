import { describe, expect, it } from "vitest";
import { formatLocaleDate, formatLocaleMoney, getAppLocale, resolveLocale } from "./locale";
import { LEGAL_DOCUMENTS, legalMarketFor } from "./legalDocuments";
import { rightsCopy } from "./rightsCopy";

describe("locale scaffolding", () => {
  it("falls back pt-BR → pt-BR, other pt → pt-PT, else en", () => {
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("pt_br")).toBe("pt-BR");
    expect(resolveLocale("pt")).toBe("pt-PT");
    expect(resolveLocale("pt-AO")).toBe("pt-PT");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });
  it("stays English unless a supported locale was saved", () => {
    expect(getAppLocale({ getItem: () => null })).toBe("en");
    expect(getAppLocale({ getItem: () => "pt-BR" })).toBe("pt-BR");
    expect(getAppLocale({ getItem: () => "fr" })).toBe("en");
  });
  it("formats dates per the email spec", () => {
    const d = new Date(2026, 11, 12);
    expect(formatLocaleDate(d, "en")).toBe("Dec 12, 2026");
    expect(formatLocaleDate(d, "pt-PT")).toBe("12 dez 2026");
    expect(formatLocaleDate(d, "pt-BR")).toBe("12 de dez. de 2026");
  });
  it("formats EUR per locale", () => {
    expect(formatLocaleMoney(449, "en")).toBe("€449.00");
    expect(formatLocaleMoney(449, "pt-PT")).toBe("449,00 €");
    expect(formatLocaleMoney(449, "pt-BR")).toBe("€ 449,00");
  });
});

describe("legal structure", () => {
  it("routes BR and US to their own (placeholder) market documents", () => {
    expect(legalMarketFor("br")).toBe("BR");
    expect(legalMarketFor("US")).toBe("US");
    expect(legalMarketFor("DE")).toBe("PT");
    expect(LEGAL_DOCUMENTS.BR).toMatchObject({ locale: "pt-BR", status: "placeholder" });
    expect(LEGAL_DOCUMENTS.US.note).toContain("[LEGAL REVIEW NEEDED]");
  });
  it("has rights copy for every locale", () => {
    expect(rightsCopy("pt-BR").manufacturerWarranty(12)).toBe("Garantia do fabricante (1 ano)");
    expect(rightsCopy("pt-BR").brComplaintDeadline(90)).toContain("90 dias");
    expect(rightsCopy("en").manufacturerWarranty(18)).toBe("Manufacturer warranty (18 months)");
  });
});
