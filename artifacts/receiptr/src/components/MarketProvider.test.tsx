import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketProvider, useMarket, VISITOR_MARKET_KEY } from "./MarketProvider";

const mocks = vi.hoisted(() => ({
  auth: { userId: null as string | null, isLoaded: true },
  request: vi.fn(),
}));
vi.mock("@clerk/react", () => ({ useAuth: () => mocks.auth }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: (...args: unknown[]) => mocks.request(...args) }));
function View() {
  const m = useMarket();
  return <div>
    <output data-testid="market">{JSON.stringify({ market: m.market, country: m.country, source: m.source, confirmed: m.confirmed, loading: m.loading, saving: m.saving })}</output>
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
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("market resolution and session isolation", () => {
  it("never contacts a third-party location service: unknown stays unknown", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mocks.request.mockResolvedValue({ country: null, market: null });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: null, source: "unknown", loading: false }));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][0]).toMatch(/\/api\/market\/suggestion$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("a known unsupported country is exposed for the notice, with no market", async () => {
    mocks.request.mockResolvedValue({ country: "JP", market: null });
    view();
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state()).toMatchObject({ market: null, country: "JP" });
  });
  it("never looks up location when an account read fails", async () => {
    mocks.auth.userId = "A";
    mocks.request.mockRejectedValue(new Error("Account unavailable"));
    view();
    await screen.findByText(/Could not load or save/);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("does not let a late suggestion overwrite manual choice", async () => {
    const late = deferred<{ country: string; market: string }>();
    mocks.request.mockReturnValue(late.promise);
    view();
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
    mocks.request.mockResolvedValueOnce({ market: "BR", country: null });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", source: "account" }));
    // The visitor's own choice is sent first (before the server could fill it from the IP).
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ market: "BR", onlyIfUnset: true });
    expect(localStorage.getItem(VISITOR_MARKET_KEY)).toBeNull();
  });
  it("existing account wins over visitor and IP, and works on another device", async () => {
    localStorage.setItem(VISITOR_MARKET_KEY, "US");
    mocks.auth.userId = "existing";
    mocks.request.mockResolvedValue({ market: "BR" });
    const first = view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", source: "account" }));
    // onlyIfUnset: the server keeps the existing BR (coalesce), the visitor's US is not applied.
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][1].method).toBe("PATCH");
    first.unmount();
    localStorage.clear();
    sessionStorage.clear();
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", confirmed: true }));
  });
  it("signed-in account without a market: the server fills it from the IP; the client never PATCHes a suggestion", async () => {
    mocks.request.mockResolvedValueOnce({ country: "US", market: "US" });
    const root = view();
    await waitFor(() => expect(state().source).toBe("suggestion"));
    mocks.auth.userId = "fresh-account";
    mocks.request.mockResolvedValueOnce({ market: "US", country: "US" });
    root.rerender(<MarketProvider><View /></MarketProvider>);
    await waitFor(() => expect(state()).toMatchObject({ market: "US", country: "US", source: "account", confirmed: true }));
    expect(mocks.request.mock.calls.every(([, opts]) => opts.method !== "PATCH")).toBe(true);
  });
  it("signed-in account in an uncovered country: no market, country kept for the notice", async () => {
    mocks.auth.userId = "jp-account";
    mocks.request.mockResolvedValueOnce({ market: null, country: "JP" });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: null, country: "JP", source: "unknown", loading: false }));
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
    // Only account A consumed the visitor choice; B never PATCHes.
    expect(mocks.request.mock.calls.slice(1).every(([, opts]) => opts.method !== "PATCH")).toBe(true);
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
    mocks.request.mockResolvedValueOnce({ market: "BR" });
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: "BR", source: "account" }));
    expect(JSON.parse(mocks.request.mock.calls.at(-1)![1].body)).toEqual({ market: "BR", onlyIfUnset: true });
    expect(sessionStorage.getItem("receebo:pendingVisitorMarket:A")).toBeNull();
  });
  it("failed GeoIP stays nonblocking and an explicit choice works offline", async () => {
    mocks.request.mockRejectedValue(new Error("unavailable"));
    view();
    await waitFor(() => expect(state()).toMatchObject({ market: null, source: "unknown", loading: false }));
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
