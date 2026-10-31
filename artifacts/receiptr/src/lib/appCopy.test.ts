import { afterEach, describe, expect, it } from "vitest";
import { APP_COPY, appError, appText, categoryText } from "./appCopy";
import { APP_LOCALES, setAccountLocale } from "./locale";
import { countryName, countryOptions, normalizeCountry } from "./countries";
import { formatMoney, formatPurchaseDate, groupByMonth, itemCountLabel } from "./pendingImports";
import { TRIAL_CAP_MESSAGE, isTrialLimitMessage } from "./trialCopy";

afterEach(() => setAccountLocale(undefined));

describe("application copy", () => {
  it("has Portuguese copy and matching interpolation slots for every entry", () => {
    const slots = (s: string) => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
    expect(Object.keys(APP_COPY).length).toBeGreaterThan(400);
    for (const [key, variants] of Object.entries(APP_COPY)) {
      for (const locale of APP_LOCALES) {
        const result = appText(key, [], locale);
        expect(result.trim(), `${locale}: ${key}`).not.toBe("");
        expect(slots(result), `${locale}: ${key}`).toEqual(slots(key));
      }
      expect(variants[0].trim()).not.toBe("");
    }
  });

  it("uses the existing preference, including regional wording", () => {
    setAccountLocale("en");
    expect(appText("Settings")).toBe("Settings");
    expect(categoryText("Home")).toBe("Home");
    setAccountLocale("pt-PT");
    expect(appText("Settings")).toBe("Definições");
    expect(appText("Search")).toBe("Pesquisar");
    expect(categoryText("Home")).toBe("Casa");
    setAccountLocale("pt-BR");
    expect(appText("Settings")).toBe("Configurações");
    expect(appText("Search")).toBe("Buscar");
    expect(categoryText("Home")).toBe("Casa");
  });

  it("does not translate interpolated merchant/file data or reinterpret placeholders in it", () => {
    const merchant = "Home {1} & Casa Lumen";
    expect(appText("{0} added to this receipt.", [merchant], "pt-BR")).toBe(`${merchant} adicionado a este recibo.`);
    expect(appText("{0} item(s)", [1], "en")).toBe("1 item");
    expect(appText("{0} item(s)", [2], "en")).toBe("2 items");
    expect(appText("{0} item(s)", [2], "pt-BR")).toBe("2 itens");
    expect(appText("{0} item(s)", [2], "pt-PT")).toBe("2 artigos");
  });

  it("keeps server trial comparisons canonical and unknown errors localized", () => {
    setAccountLocale("pt-BR");
    expect(isTrialLimitMessage(TRIAL_CAP_MESSAGE)).toBe(true);
    expect(isTrialLimitMessage(appText(TRIAL_CAP_MESSAGE))).toBe(false);
    expect(appError("Internal server stack", "Could not send the code.")).toBe(appText("Could not send the code."));
    expect(appError("That code has expired. Request a new one.", "Could not send the code.")).toBe(appText("That code has expired. Request a new one."));
  });

  it("localizes display dates and money without changing ISO country codes or converting currencies", () => {
    setAccountLocale("pt-PT");
    const eur = formatMoney(123.45, "EUR");
    expect(eur).toContain("123,45");
    expect(eur).toContain("€");
    expect(formatMoney(123.45, "USD")).toContain("123,45");
    expect(formatMoney(123.45, "BRL")).toContain("123,45");
    expect(countryName("US")).toBe("Estados Unidos");
    expect(normalizeCountry("us")).toBe("US");
    expect(countryOptions().map(o => o.code).sort()).toEqual(countryOptions("en").map(o => o.code).sort());
    expect(formatPurchaseDate("2026-12-12")).toBe("12 dez 2026");
    expect(itemCountLabel({ productCount: 2 })).toBe("2 artigos");
    expect(groupByMonth([{ purchaseDate: "2026-12-12" } as never])[0].label).toBe("dezembro de 2026");
    setAccountLocale("pt-BR");
    expect(formatPurchaseDate("2026-12-12")).toBe("12 de dez. de 2026");
    expect(itemCountLabel({ productCount: 2 })).toBe("2 itens");
  });
});
