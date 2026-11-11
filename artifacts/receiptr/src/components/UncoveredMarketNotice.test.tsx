import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketContext, type MarketState } from "./MarketProvider";
import { UncoveredMarketNotice, interestSentKey } from "./UncoveredMarketNotice";
import { setAccountLocale } from "@/lib/locale";
import { acceptAll, CONSENT_STORAGE_KEY } from "@/lib/adConsent";

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
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  vi.stubGlobal("matchMedia", () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {} }));
  setAccountLocale(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("UncoveredMarketNotice", () => {
  it("stores the already-sent preference only after preferences are allowed", async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll()));
    render(<MarketContext.Provider value={market("ES")}><UncoveredMarketNotice /></MarketContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: /interested/i }));
    await waitFor(() => expect(localStorage.getItem(interestSentKey("ES"))).toBe("1"));
  });
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
    expect(localStorage.getItem(interestSentKey("ES"))).toBeNull();
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
  it("links to a country choice and hides once a covered market is chosen", () => {
    setAccountLocale("pt-BR");
    const choose = vi.fn(async () => {});
    const view = (confirmed: boolean) => ({
      ...market("BE"), market: confirmed ? "PT" as const : null, confirmed, source: confirmed ? "visitor" as const : "suggestion" as const, choose,
    });
    const { rerender } = render(<MarketContext.Provider value={view(false)}><UncoveredMarketNotice /></MarketContext.Provider>);
    expect(screen.getByTestId("button-uncovered-choose-country").textContent).toBe("Não está na Bélgica? Escolher país");
    fireEvent.click(screen.getByTestId("button-uncovered-choose-country"));
    expect(screen.getByTestId("dialog-market-picker")).toBeTruthy();
    expect(screen.getByTestId("select-market")).toBeTruthy();
    rerender(<MarketContext.Provider value={view(true)}><UncoveredMarketNotice /></MarketContext.Provider>);
    expect(screen.queryByTestId("notice-uncovered-market")).toBeNull();
  });
  it("opens the choice in a bottom sheet on a narrow viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const { rerender } = render(<MarketContext.Provider value={market("BE")}><UncoveredMarketNotice variant="floating" /></MarketContext.Provider>);
    rerender(<MarketContext.Provider value={market("BE")}><UncoveredMarketNotice variant="floating" /></MarketContext.Provider>);
    fireEvent.click(screen.getByTestId("button-uncovered-choose-country"));
    expect(screen.getByTestId("sheet-market-picker")).toBeTruthy();
    expect(screen.queryByTestId("dialog-market-picker")).toBeNull();
  });
  it("outside the provider (tests, guest) it renders nothing", () => {
    render(<UncoveredMarketNotice />);
    expect(screen.queryByTestId("notice-uncovered-market")).toBeNull();
  });
});
