import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setAccountLocale, type AppLocale } from "@/lib/locale";
import { BrandLoading } from "./BrandLoading";

afterEach(() => setAccountLocale(undefined));

describe("BrandLoading", () => {
  it.each([
    ["en", "Receipts. Easy to find.", "Loading…"],
    ["pt-PT", "Recibos. Fáceis de encontrar.", "A carregar…"],
    ["pt-BR", "Recibos. Fáceis de encontrar.", "Carregando…"],
  ] as const)("uses the %s slogan and loading announcement", (locale: AppLocale, slogan, announcement) => {
    setAccountLocale(locale);
    render(<BrandLoading />);
    expect(screen.getByText("Receebo")).toBeInTheDocument();
    expect(screen.getByText(slogan)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(announcement);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const mark = screen.getByTestId("status-brand-loading").querySelector("img")!;
    expect(mark).toHaveAttribute("src", `${import.meta.env.BASE_URL}logo-mark.svg`);
    expect(mark).toHaveAttribute("alt", "");
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });
});
