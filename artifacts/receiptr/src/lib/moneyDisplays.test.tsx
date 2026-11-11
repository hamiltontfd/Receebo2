import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { setAccountLocale, type AppLocale } from "./locale";
import { formatMoney } from "./pendingImports";
import { formatAmount } from "./protectedValue";
import { NotableItemsBanner } from "@/components/NotableItemsBanner";
import { ItemCoverageSections } from "@/components/ItemCoverageSections";

afterEach(() => setAccountLocale(undefined));

const cases: [AppLocale, string, number, string][] = [
  ["pt-PT", "EUR", 649, "649,00 €"],
  ["pt-BR", "BRL", 3199, "R$ 3.199,00"],
  ["en", "USD", 486, "$486.00"],
  ["en", "EUR", 649, "€649.00"],
];

describe("shared receipt money formatting", () => {
  it.each(cases)("formats helpers and item displays in %s / %s", (locale, currency, amount, expected) => {
    setAccountLocale(locale);
    expect(formatMoney(amount, currency)).toBe(expected);
    expect(formatAmount(amount, currency)).toBe(expected);
    const item = { name: "Fictional sample item", price: amount, category: "Electronics", reason: "Sample" };
    render(
      <>
        <NotableItemsBanner items={[item]} currency={currency} />
        <ItemCoverageSections products={[item]} notableItems={[item]} currency={currency} />
      </>,
    );
    // Banner, highlight and complete item list must all use the same format.
    expect(screen.getAllByText(expected)).toHaveLength(3);
  });
});
