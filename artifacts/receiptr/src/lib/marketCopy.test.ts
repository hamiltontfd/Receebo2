import { afterEach, describe, expect, it, vi } from "vitest";
import { getMarketCopy } from "./marketCopy";
import { lt } from "./landingLocale";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("browser-based public copy", () => {
  it("uses Brazilian Portuguese without inferring Brazil as market", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    expect(getMarketCopy().labels.US).toBe("Estados Unidos");
    expect(getMarketCopy().saving).toBe("Salvando");
    expect(lt("Receipts", "Recibos", "Notas")).toBe("Notas");
    expect(localStorage.getItem("receebo:visitorMarket")).toBeNull();
  });
  it("uses European Portuguese and leaves subscription EUR unchanged", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-PT"]);
    expect(getMarketCopy().saving).toBe("A guardar");
    expect(lt("€2.99/month", "2,99 €/mês")).toBe("2,99 €/mês");
  });
  it("does not change language when market changes", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    localStorage.setItem("receebo:visitorMarket", "BR");
    expect(getMarketCopy().region).toBe("Region");
    expect(lt("Start free", "Começar grátis")).toBe("Start free");
  });
});
