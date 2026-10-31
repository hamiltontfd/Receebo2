import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("external country suggestion", () => {
  it("contacts only the caller endpoint, without credentials, referrer or visitor identifiers", async () => {
    fetchMock.mockResolvedValue(response({ ip: "198.51.100.1", country: "US" }));
    const { lookupExternalMarket } = await import("./marketSuggestion");
    expect(await lookupExternalMarket(new AbortController().signal)).toEqual({ country: "US", market: "US" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.country.is/", expect.objectContaining({
      credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    }));
    expect(Object.keys(fetchMock.mock.calls[0][1]).sort()).toEqual(["cache", "credentials", "referrerPolicy", "signal"]);
    expect(localStorage.length).toBe(0);
  });
  it("maps EU countries to PT without changing the actual country", async () => {
    const { marketForCountry, lookupExternalMarket } = await import("./marketSuggestion");
    for (const code of "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" ")) {
      expect(marketForCountry(code)).toBe("PT");
    }
    expect(marketForCountry("BR")).toBe("BR");
    expect(marketForCountry("US")).toBe("US");
    for (const code of ["GB", "NO", "CH", "JP", null]) expect(marketForCountry(code)).toBeNull();
    fetchMock.mockResolvedValue(response({ country: "DE" }));
    expect(await lookupExternalMarket(new AbortController().signal)).toEqual({ country: "DE", market: "PT" });
  });
  it("does not invent a supported market for an unsupported country", async () => {
    fetchMock.mockResolvedValue(response({ country: "JP" }));
    const { lookupExternalMarket } = await import("./marketSuggestion");
    expect(await lookupExternalMarket(new AbortController().signal)).toEqual({ country: "JP", market: null });
  });
  it.each([null, {}, { country: "XX" }, { country: 123 }, { country: "EU" }])("rejects invalid country payload %j", async (payload) => {
    fetchMock.mockResolvedValue(response(payload));
    const { lookupExternalMarket } = await import("./marketSuggestion");
    await expect(lookupExternalMarket(new AbortController().signal)).rejects.toThrow("no valid country");
  });
  it("fails explicitly on HTTP errors and permits a subsequent retry", async () => {
    fetchMock.mockResolvedValueOnce(response({}, 429)).mockResolvedValueOnce(response({ country: "BR" }));
    const { lookupExternalMarket } = await import("./marketSuggestion");
    await expect(lookupExternalMarket(new AbortController().signal)).rejects.toThrow("unavailable");
    expect(await lookupExternalMarket(new AbortController().signal)).toEqual({ country: "BR", market: "BR" });
  });
  it("keeps only country/market in a short-lived memory cache, never IPs in browser storage", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => response({ ip: "198.51.100.1", country: "BR", city: "Ignore" }));
    const { lookupExternalMarket } = await import("./marketSuggestion");
    const first = await lookupExternalMarket(new AbortController().signal);
    expect(first).toEqual({ country: "BR", market: "BR" });
    await lookupExternalMarket(new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await lookupExternalMarket(new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("makes no request when already cancelled", async () => {
    const { lookupExternalMarket } = await import("./marketSuggestion");
    const abort = new AbortController();
    abort.abort();
    await expect(lookupExternalMarket(abort.signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels slow requests after three seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const { lookupExternalMarket } = await import("./marketSuggestion");
    const rejected = expect(lookupExternalMarket(new AbortController().signal)).rejects.toThrow("Aborted");
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("rejects late responses after parent cancellation and does not cache them", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolve = r; }))
      .mockResolvedValueOnce(response({ country: "BR" }));
    const { lookupExternalMarket } = await import("./marketSuggestion");
    const abort = new AbortController();
    const pending = lookupExternalMarket(abort.signal);
    abort.abort();
    resolve(response({ country: "US" }));
    await expect(pending).rejects.toThrow();
    expect(await lookupExternalMarket(new AbortController().signal)).toEqual({ country: "BR", market: "BR" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
