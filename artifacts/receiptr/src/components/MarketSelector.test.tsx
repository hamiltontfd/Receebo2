import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const state = {
  market: null as "PT" | "BR" | "US" | null,
  source: "unknown" as "account" | "visitor" | "suggestion" | "unknown",
  confirmed: false, loading: false, saving: false, error: null as string | null,
  choose: vi.fn(async () => {}), retry: vi.fn(),
};
vi.mock("@/components/MarketProvider", () => ({ useMarket: () => state }));

import { MarketSelector } from "./MarketSelector";
import { PurchaseCountryField, PurchaseCountryValue } from "./PurchaseCountryField";

beforeEach(() => {
  Object.assign(state, { market: null, source: "unknown", confirmed: false, saving: false, error: null });
  state.choose.mockClear(); state.retry.mockClear();
});

describe("MarketSelector", () => {
  it("invites without blocking when unknown", () => {
    render(<MarketSelector />);
    expect(screen.getByTestId("status-market-unknown")).toBeTruthy();
    expect(screen.getByText(/doesn't change the country of your purchases/)).toBeTruthy();
  });
  it("shows an unconfirmed suggestion with confirm action", () => {
    Object.assign(state, { market: "BR", source: "suggestion" });
    render(<MarketSelector />);
    fireEvent.click(screen.getByTestId("button-market-confirm"));
    expect(state.choose).toHaveBeenCalledWith("BR");
  });
  it("offers retry on save error", () => {
    Object.assign(state, { market: "US", source: "account", error: "x" });
    render(<MarketSelector />);
    fireEvent.click(screen.getByTestId("button-market-retry"));
    expect(state.retry).toHaveBeenCalled();
  });
  it("labels Portugal as Portugal / European Union", () => {
    render(<MarketSelector />);
    expect(screen.getByRole("option", { name: "Portugal / European Union" })).toBeTruthy();
  });
});

describe("PurchaseCountryField", () => {
  it("keeps real countries and maps Unknown to null", () => {
    const onChange = vi.fn();
    render(<PurchaseCountryField value="DE" onChange={onChange} />);
    const select = screen.getByTestId("select-purchase-country") as HTMLSelectElement;
    expect(select.value).toBe("DE");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
    fireEvent.change(select, { target: { value: "FR" } });
    expect(onChange).toHaveBeenCalledWith("FR");
  });
  it("shows Unknown for null", () => {
    render(<PurchaseCountryValue value={null} />);
    expect(screen.getByTestId("text-purchase-country").textContent).toBe("Unknown");
  });
});
