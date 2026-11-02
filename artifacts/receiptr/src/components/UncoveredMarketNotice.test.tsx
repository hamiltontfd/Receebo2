import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketContext, type MarketState } from "./MarketProvider";
import { UncoveredMarketNotice, interestSentKey } from "./UncoveredMarketNotice";
import { setAccountLocale } from "@/lib/locale";

const market = (country: string | null): MarketState => ({
  market: null, country, source: "unknown", confirmed: false, loading: false, saving: false, error: null,
  choose: async () => {}, retry: () => {},
});
const mount = (country: string | null) =>
  render(<MarketContext.Provider value={market(country)}><UncoveredMarketNotice /></MarketContext.Provider>);

const fetchMock = vi.fn();
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  setAccountLocale(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("UncoveredMarketNotice", () => {
  it("hidden for covered countries and when the country is unknown", () => {
    for (const c of ["PT", "BR", "US", null]) {
      const { unmount } = mount(c);
      expect(screen.queryByTestId("notice-uncovered-market")).toBeNull();
      unmount();
    }
  });
  it("shows for another country (Spain too: EU rules, not covered) and sends only the country code", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
    mount("ES");
    expect(screen.getByText("Receebo doesn't cover Spain yet")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-market-interest"));
    await screen.findByTestId("text-market-interest-thanks");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/market\/interest$/);
    expect(JSON.parse(init.body)).toEqual({ country: "ES" });
    expect(init.credentials).toBe("omit");
    expect(localStorage.getItem(interestSentKey("ES"))).toBe("1");
  });
  it("after sending once, it doesn't come back for that country", () => {
    localStorage.setItem(interestSentKey("JP"), "1");
    mount("JP");
    expect(screen.queryByTestId("notice-uncovered-market")).toBeNull();
  });
  it("close hides it for the session", async () => {
    const first = mount("JP");
    fireEvent.click(screen.getByTestId("button-uncovered-close"));
    await waitFor(() => expect(screen.queryByTestId("notice-uncovered-market")).toBeNull());
    first.unmount();
    mount("JP");
    expect(screen.queryByTestId("notice-uncovered-market")).toBeNull();
  });
  it("copy in pt-PT and pt-BR", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-PT"]);
    const a = mount("JP");
    expect(screen.getByText(/O Receebo ainda não cobre Japão/)).toBeTruthy();
    expect(screen.getByText("Tenho interesse")).toBeTruthy();
    a.unmount();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    mount("JP");
    expect(screen.getByText(/O Receebo ainda não atende Japão/)).toBeTruthy();
  });
  it("outside the provider (tests, guest) it renders nothing", () => {
    render(<UncoveredMarketNotice />);
    expect(screen.queryByTestId("notice-uncovered-market")).toBeNull();
  });
});
