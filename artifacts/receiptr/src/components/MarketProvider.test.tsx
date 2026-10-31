import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketProvider, useMarket, VISITOR_MARKET_KEY } from "./MarketProvider";

const mocks = vi.hoisted(() => ({
  auth: { userId: null as string | null, isLoaded: true },
  request: vi.fn(),
  external: vi.fn(),
}));
vi.mock("@clerk/react", () => ({ useAuth: () => mocks.auth }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: (...args: unknown[]) => mocks.request(...args) }));
vi.mock("@/lib/marketSuggestion", () => ({ lookupExternalMarket: (...args: unknown[]) => mocks.external(...args) }));
function View() {
  const m = useMarket();
  return <div>
    <output data-testid="market">{JSON.stringify({ market: m.market, source: m.source, confirmed: m.confirmed, loading: m.loading, saving: m.saving })}</output>
    <span>{m.error}</span>
    <button onClick={() => void m.choose("BR")}>Brazil</button>
    <button onClick={() => void m.choose("US")}>US</button>
    <button onClick={m.retry}>Retry</button>
  </div>;
}
const view = () => render(<MarketProvider><View /></MarketProvider>);
const state = () => JSON.parse(screen.getByTestId("market").textContent!);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  mocks.auth = { userId: null, isLoaded: true };
  mocks.request.mockReset();
  mocks.external.mockReset().mockRejectedValue(new Error("Unavailable"));
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("market resolution and session isolation", () => {
  it("preselects the external visitor country when local proxy addresses are unknown", async () => {
    mocks.request.mockResolvedValue({ country: null, market: null });
    mocks.external.mockResolvedValue({ country: "DE", market: "PT" });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "PT", source: "suggestion", confirmed: false, loading: false }));
    expect(mocks.external).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(VISITOR_MARKET_KEY)).toBeNull();
  });
  it("can use the external suggestion when the local suggestion API fails", async () => {
    mocks.request.mockRejectedValue(new Error("Local API down"));
    mocks.external.mockResolvedValue({ country: "US", market: "US" });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "US", source: "suggestion", confirmed: false }));
  });
  it("never asks the external provider for a known unsupported local country", async () => {
    mocks.request.mockResolvedValue({ country: "JP", market: null });
    view();
    await waitFor(() => expect(state().loading).toBe(false));
    expect(mocks.external).not.toHaveBeenCalled();
    expect(state().market).toBeNull();
  });
  it("never looks up location when an account read fails", async () => {
    mocks.auth.userId = "A";
    mocks.request.mockRejectedValue(new Error("Account unavailable"));
    view();
    await screen.findByText(/Could not load or save/);
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it("does not let a late external suggestion overwrite manual choice", async () => {
    const late = deferred<{ country: string; market: string }>();
    mocks.request.mockResolvedValue({ country: null, market: null });
    mocks.external.mockReturnValue(late.promise);
    view();
    await waitFor(() => expect(mocks.external).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Brazil"));
    await act(async () => late.resolve({ country: "US", market: "US" }));
    expect(state()).toMatchObject({ market: "BR", source: "visitor", confirmed: true });
  });
  it("US IP suggestion stays unconfirmed with pt-BR browser and never persists", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("pt-BR");
    mocks.request.mockResolvedValue({ country: "US", market: "US" });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "US", source: "suggestion", confirmed: false, loading: false }));
    expect(localStorage.getItem(VISITOR_MARKET_KEY)).toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
  it("unknown/nonserved country invites choice without PT fallback", async () => {
    mocks.request.mockResolvedValue({ country: "JP", market: null });
    view();
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state()).toMatchObject({ market: null, source: "unknown", confirmed: false });
  });
  it("explicit browser choice survives reload and no IP call overrides it", async () => {
    localStorage.setItem(VISITOR_MARKET_KEY, "BR");
    const first = view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", confirmed: true }));
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.external).not.toHaveBeenCalled();
    first.unmount();
    view();
    await waitFor(() => expect(state().source).toBe("visitor"));
  });
  it("late IP response cannot replace a manual choice", async () => {
    const late = deferred<{ country: string; market: string }>();
    mocks.request.mockReturnValue(late.promise);
    view();
    fireEvent.click(screen.getByText("Brazil"));
    await act(async () => late.resolve({ country: "US", market: "US" }));
    expect(state()).toMatchObject({ market: "BR", source: "visitor", confirmed: true });
    expect(localStorage.getItem(VISITOR_MARKET_KEY)).toBe("BR");
  });
  it("adopts only explicit visitor choice into an empty account", async () => {
    localStorage.setItem(VISITOR_MARKET_KEY, "BR");
    mocks.auth.userId = "new-account";
    mocks.request.mockResolvedValueOnce({ market: null }).mockResolvedValueOnce({ market: "BR" });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", source: "account" }));
    expect(JSON.parse(mocks.request.mock.calls[1][1].body)).toEqual({ market: "BR", onlyIfUnset: true });
    expect(localStorage.getItem(VISITOR_MARKET_KEY)).toBeNull();
  });
  it("existing account wins over visitor and IP, and works on another device", async () => {
    localStorage.setItem(VISITOR_MARKET_KEY, "US");
    mocks.auth.userId = "existing";
    mocks.request.mockResolvedValue({ market: "BR" });
    const first = view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", source: "account" }));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.external).not.toHaveBeenCalled();
    first.unmount();
    localStorage.clear();
    sessionStorage.clear();
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", confirmed: true }));
  });
  it("does not adopt a suggestion into the account", async () => {
    mocks.request.mockResolvedValueOnce({ country: "US", market: "US" });
    const root = view();
    await waitFor(() => expect(state().source).toBe("suggestion"));
    mocks.auth.userId = "fresh-account";
    mocks.request.mockResolvedValueOnce({ market: null }).mockResolvedValueOnce({ country: "BR", market: "BR" });
    root.rerender(<MarketProvider><View /></MarketProvider>);
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", source: "suggestion" }));
    expect(mocks.request.mock.calls.every(([, opts]) => opts.method !== "PATCH")).toBe(true);
  });
  it("logout and another account never expose or adopt previous account preference", async () => {
    localStorage.setItem(VISITOR_MARKET_KEY, "BR");
    mocks.auth.userId = "A";
    mocks.request.mockResolvedValueOnce({ market: "BR" });
    const root = view();
    await waitFor(() => expect(state().source).toBe("account"));
    mocks.auth.userId = null;
    const geo = deferred<object>();
    mocks.request.mockReturnValueOnce(geo.promise);
    root.rerender(<MarketProvider><View /></MarketProvider>);
    expect(state().market).toBeNull();
    mocks.auth.userId = "B";
    mocks.request.mockResolvedValueOnce({ market: "US" });
    root.rerender(<MarketProvider><View /></MarketProvider>);
    expect(state().market).toBeNull();
    await waitFor(() => expect(state()).toMatchObject({ market: "US", source: "account" }));
    await act(async () => geo.resolve({ market: "PT" }));
    expect(state().market).toBe("US");
    expect(mocks.request.mock.calls.every(([, opts]) => opts.method !== "PATCH")).toBe(true);
  });
  it("rejects late account hydration after an explicit save", async () => {
    mocks.auth.userId = "A";
    const late = deferred<object>();
    mocks.request.mockReturnValueOnce(late.promise).mockResolvedValueOnce({ market: "BR" });
    view();
    fireEvent.click(screen.getByText("Brazil"));
    await waitFor(() => expect(state().market).toBe("BR"));
    await act(async () => late.resolve({ market: "US" }));
    expect(state()).toMatchObject({ market: "BR", source: "account", confirmed: true });
  });
  it("failed save keeps server-confirmed market, retry is explicit and recoverable", async () => {
    mocks.auth.userId = "A";
    mocks.request.mockResolvedValueOnce({ market: "US" }).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ market: "BR" });
    view();
    await waitFor(() => expect(state().market).toBe("US"));
    fireEvent.click(screen.getByText("Brazil"));
    await screen.findByText(/Could not save your market/);
    expect(state().market).toBe("US");
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(state().market).toBe("BR"));
  });
  it("failed signup transfer survives reload only for its original account", async () => {
    localStorage.setItem(VISITOR_MARKET_KEY, "BR");
    mocks.auth.userId = "A";
    mocks.request.mockRejectedValueOnce(new Error("offline"));
    const root = view();
    await screen.findByText(/Could not load or save/);
    expect(localStorage.getItem(VISITOR_MARKET_KEY)).toBeNull();
    root.unmount();
    mocks.request.mockResolvedValueOnce({ market: null }).mockResolvedValueOnce({ market: "BR" });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", source: "account" }));
    expect(sessionStorage.getItem("receebo:pendingVisitorMarket:A")).toBeNull();
  });
  it("failed GeoIP stays nonblocking and an explicit choice works offline", async () => {
    mocks.request.mockRejectedValue(new Error("unavailable"));
    view();
    await screen.findByText(/Location unavailable/);
    expect(state().market).toBeNull();
    fireEvent.click(screen.getByText("Brazil"));
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", confirmed: true }));
  });
  it("refreshes account preference after another device changes it", async () => {
    mocks.auth.userId = "A";
    mocks.request.mockResolvedValueOnce({ market: "BR" }).mockResolvedValueOnce({ market: "US" });
    view();
    await waitFor(() => expect(state().market).toBe("BR"));
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(state()).toMatchObject({ market: "US", source: "account" }));
  });
});
