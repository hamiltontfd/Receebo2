import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
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
    // Hamilton, 2 Nov 2026: any language other than English or Portuguese -> English.
    for (const tag of ["es-ES", "fr-FR", "de", "it-IT", "zh-CN", ""]) expect(resolveLocale(tag)).toBe("en");
  });
  it("uses browser language independently of market and legacy visitor overrides", () => {
    expect(getAppLocale({ getItem: () => null }, "en-US")).toBe("en");
    expect(getAppLocale({ getItem: () => null }, "pt-BR")).toBe("pt-BR");
    expect(getAppLocale(null, "pt-PT")).toBe("pt-PT");
    expect(getAppLocale({ getItem: () => "pt-BR" }, "en-US")).toBe("en");
    expect(getAppLocale({ getItem: () => "fr" }, "pt-PT")).toBe("pt-PT");
    expect(getAppLocale({ getItem: () => { throw new Error("Denied"); } }, "pt-BR")).toBe("pt-BR");
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
  it("formats each amount's currency with the UI locale and plain spaces", () => {
    expect(formatLocaleMoney(649, "pt-PT", "EUR")).toBe("649,00 €");
    expect(formatLocaleMoney(3199, "pt-BR", "BRL")).toBe("R$ 3.199,00");
    expect(formatLocaleMoney(486, "en", "USD")).toBe("$486.00");
    expect(formatLocaleMoney(649, "en", "EUR")).toBe("€649.00");
    expect(formatLocaleMoney(3199, "en", "BRL")).toBe("R$3,199.00");
    expect(formatLocaleMoney(3199, "pt-BR", "BRL")).not.toMatch(/[\u00a0\u202f]/);
  });
  it.each(["America/Sao_Paulo", "UTC", "Europe/Lisbon"])(
    "preserves calendar days in %s without changing timestamp semantics",
    (timeZone) => {
      // A child process gives each test a real timezone, independent of Vitest's worker.
      const require = createRequire(resolve("../../scripts/package.json"));
      const source = pathToFileURL(resolve("src/lib/locale.ts")).href;
      const result = execFileSync(process.execPath, [
        "--import", pathToFileURL(require.resolve("tsx")).href, "--input-type=module", "-e",
        `import { formatLocaleDate } from ${JSON.stringify(source)};
         console.log(JSON.stringify([
           formatLocaleDate("2026-11-02", "pt-PT"),
           formatLocaleDate("2026-11-02", "pt-BR"),
           formatLocaleDate("2026-11-02", "en"),
           formatLocaleDate(new Date(2026, 10, 2), "pt-PT"),
           formatLocaleDate("2026-11-02T00:00:00Z", "pt-PT")
         ]));`,
      ], { encoding: "utf8", env: { ...process.env, TZ: timeZone } });
      expect(JSON.parse(result)).toEqual([
        "2 nov 2026", "2 de nov. de 2026", "Nov 2, 2026", "2 nov 2026",
        timeZone === "America/Sao_Paulo" ? "1 nov 2026" : "2 nov 2026",
      ]);
    },
  );
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
