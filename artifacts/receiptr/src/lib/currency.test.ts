import { describe, it, expect } from "vitest";
import { currencySymbol } from "./currency";

describe("currencySymbol", () => {
  it("returns $ for USD", () => {
    expect(currencySymbol("USD")).toBe("$");
  });

  it("returns $ when currency is undefined", () => {
    expect(currencySymbol(undefined)).toBe("$");
  });

  it("returns $ when currency is null", () => {
    expect(currencySymbol(null)).toBe("$");
  });

  it("returns $ when currency is empty string", () => {
    expect(currencySymbol("")).toBe("$");
  });

  it("returns € for EUR", () => {
    expect(currencySymbol("EUR")).toBe("€");
  });

  it("returns £ for GBP", () => {
    expect(currencySymbol("GBP")).toBe("£");
  });

  it("returns ISO code with trailing space for unknown currencies", () => {
    expect(currencySymbol("JPY")).toBe("JPY ");
    expect(currencySymbol("CAD")).toBe("CAD ");
  });
});
