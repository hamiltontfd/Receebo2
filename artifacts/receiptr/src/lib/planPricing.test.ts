import { describe, expect, it } from "vitest";
import { formatPlanPrice, planCurrencyForMarket, planPrices } from "./planPricing";

describe("plan pricing", () => {
  it("prices BR in BRL and the US in USD", () => {
    expect(planCurrencyForMarket("BR")).toBe("BRL");
    expect(planCurrencyForMarket("US")).toBe("USD");
    for (const m of ["PT", null, undefined]) expect(planCurrencyForMarket(m)).toBe("EUR");
  });
  it("formats per locale", () => {
    expect(formatPlanPrice("monthly", "BRL", "pt-BR")).toBe("R$ 20,00");
    expect(formatPlanPrice("yearly", "BRL", "pt-BR")).toBe("R$ 200,00");
    expect(formatPlanPrice("monthly", "EUR", "pt-PT")).toBe("2,99 €");
    expect(formatPlanPrice("yearly", "EUR", "pt-PT")).toBe("24,99 €");
    expect(formatPlanPrice("monthly", "EUR", "en")).toBe("€2.99");
    expect(formatPlanPrice("yearly", "EUR", "en")).toBe("€24.99");
    expect(formatPlanPrice("monthly", "BRL", "en")).toBe("R$20.00");
    expect(formatPlanPrice("monthly", "USD", "en")).toBe("$3.50");
    expect(formatPlanPrice("yearly", "USD", "en")).toBe("$28.50");
    expect(formatPlanPrice("monthly", "USD", "pt-PT")).toBe("3,50 US$");
    expect(formatPlanPrice("monthly", "USD", "pt-BR")).toBe("US$ 3,50");
    expect(planPrices("EUR", "pt-BR")).toEqual({ monthly: "€ 2,99", yearly: "€ 24,99" });
  });
});
