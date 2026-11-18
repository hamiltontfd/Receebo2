import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketProvider, useMarket } from "./MarketProvider";
import { AdsRuntime } from "./AdsRuntime";
import { CookieConsent } from "./CookieConsent";
import { useCookieConsent } from "@/lib/useCookieConsent";
import { waitForAccountConsent } from "@/lib/accountConsentSync";
import { getAppLocale, useAppLocale } from "@/lib/locale";

const mocks = vi.hoisted(() => ({
  request: vi.fn(), path: "/us",
  auth: { isLoaded: true, isSignedIn: true, userId: "synthetic-country-user", sessionId: "session", sessionClaims: { iat: 1 } },
}));
vi.mock("@clerk/react", () => ({ useAuth: () => mocks.auth }));
vi.mock("wouter", async original => ({ ...await original<typeof import("wouter")>(), useLocation: () => [mocks.path, vi.fn()] }));
vi.mock("@workspace/api-client-react", async original => ({
  ...await original<typeof import("@workspace/api-client-react")>(), customFetch: mocks.request,
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { resolve, promise };
}
function Probe() {
  const market = useMarket();
  const { region } = useCookieConsent();
  const locale = useAppLocale();
  return <><output data-testid="state">{JSON.stringify({ market: market.market, country: market.country, region, locale })}</output>
    <button onClick={() => void market.choose("BR")}>Brazil</button></>;
}
function ConsentPanel() {
  const { region } = useCookieConsent();
  return <CookieConsent region={region} />;
}
beforeEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear(); mocks.request.mockReset();
  mocks.auth.isSignedIn = true; mocks.auth.userId = "synthetic-country-user"; mocks.auth.sessionClaims.iat = 1;
  mocks.path = "/us"; window.history.replaceState({}, "", "/us");
  vi.stubEnv("VITE_META_PIXEL_ID", "synthetic");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); delete window.fbq; delete window._fbq; });

describe("IP consent and the trial barrier before legal acceptance (all requests mocked)", () => {
  it("resolves signed-in US through the public endpoint after account 428; PATCH completes before trial and keeps Meta cookies", async () => {
    const country = deferred<{ country: string; market: string }>();
    const patch = deferred<object>();
    const order: string[] = [];
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/market/suggestion")) return country.promise;
      if (path.endsWith("/account/market")) return Promise.reject({ status: 428 });
      if (path.endsWith("/attribution/consent")) { order.push(`PATCH:${JSON.parse(String(init?.body)).marketingConsent}`); return patch.promise; }
      throw new Error("Unexpected mocked route");
    });
    document.cookie = "_fbp=synthetic-fbp; Path=/"; document.cookie = "_fbc=synthetic-fbc; Path=/";
    render(<MarketProvider><AdsRuntime /><Probe /></MarketProvider>);
    const trial = waitForAccountConsent(mocks.auth.userId).then(() => { order.push("start-trial"); });
    await act(async () => { await Promise.resolve(); });
    expect(order).toEqual([]);
    expect(document.cookie).toContain("_fbp=synthetic-fbp");
    expect(document.cookie).toContain("_fbc=synthetic-fbc");
    await act(async () => country.resolve({ country: "US", market: "US" }));
    await waitFor(() => expect(order).toEqual(["PATCH:true"]));
    expect(screen.getByTestId("state")).toHaveTextContent('"region":"US"');
    await act(async () => { patch.resolve({}); await trial; });
    expect(order).toEqual(["PATCH:true", "start-trial"]);
    expect(document.cookie).toContain("_fbp=synthetic-fbp");
    expect(document.cookie).toContain("_fbc=synthetic-fbc");
  });
  it("keeps /us English and displayed US over PT GeoIP without changing IP consent; explicit market choice wins", async () => {
    mocks.auth.isSignedIn = false; mocks.auth.userId = "";
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-PT"]);
    mocks.request.mockResolvedValue({ country: "PT", market: "PT" });
    render(<MarketProvider><Probe /><ConsentPanel /></MarketProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"country":"PT"'));
    expect(screen.getByTestId("state")).toHaveTextContent('"market":"US"');
    expect(screen.getByTestId("state")).toHaveTextContent('"region":"EU"');
    expect(getAppLocale()).toBe("en");
    expect(localStorage.getItem("receebo:visitorMarket")).toBeNull();
    fireEvent.click(screen.getByTestId("cookie-accept"));
    expect(screen.getByTestId("state")).toHaveTextContent('"market":"US"');
    expect(screen.getByTestId("state")).toHaveTextContent('"region":"EU"');
    expect(getAppLocale()).toBe("en");
    fireEvent.click(screen.getByText("Brazil"));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"market":"BR"'));
    expect(getAppLocale()).toBe("pt-PT");
  });
  it("fails closed only after country resolution fails, without persisting an implied account choice", async () => {
    mocks.auth.userId = "synthetic-failed-country";
    let rejectCountry!: (reason: unknown) => void;
    const failure = new Promise((_, reject) => { rejectCountry = reject; });
    mocks.request.mockImplementation((path: string) => {
      if (path.endsWith("/market/suggestion")) return failure;
      return Promise.reject({ status: 428 });
    });
    document.cookie = "_fbp=synthetic-before-failure; Path=/";
    render(<MarketProvider><AdsRuntime /><Probe /></MarketProvider>);
    expect(document.cookie).toContain("_fbp=synthetic-before-failure");
    await act(async () => { rejectCountry(new Error("synthetic offline")); await Promise.resolve(); });
    await act(async () => { await waitForAccountConsent(mocks.auth.userId); });
    expect(screen.getByTestId("state")).toHaveTextContent('"region":"UNKNOWN"');
    expect(document.cookie).not.toContain("_fbp=synthetic-before-failure");
    expect(mocks.request.mock.calls.some(call => String(call[0]).endsWith("/attribution/consent"))).toBe(false);
  });
  it.each([401, 403, 428])("waits on auth/legal %i without warning or timed retry; token refresh resumes", async status => {
    mocks.auth.userId = `synthetic-wait-${status}`;
    mocks.request.mockImplementation((path: string) => {
      if (path.endsWith("/market/suggestion")) return Promise.resolve({ country: "US", market: "US" });
      if (path.endsWith("/account/market")) return Promise.reject({ status: 428 });
      return Promise.reject({ status });
    });
    const ui = () => <MarketProvider><AdsRuntime /></MarketProvider>;
    const mounted = render(ui());
    await waitFor(() => expect(mocks.request.mock.calls.filter(c => String(c[0]).endsWith("/attribution/consent"))).toHaveLength(1));
    await act(async () => { await new Promise(done => setTimeout(done, 550)); });
    expect(mocks.request.mock.calls.filter(c => String(c[0]).endsWith("/attribution/consent"))).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    mocks.request.mockImplementation((path: string) => path.endsWith("/account/market")
      ? Promise.reject({ status: 428 }) : Promise.resolve({ country: "US", market: "US" }));
    mocks.auth.sessionClaims.iat++;
    mounted.rerender(ui());
    await waitFor(() => expect(mocks.request.mock.calls.filter(c => String(c[0]).endsWith("/attribution/consent"))).toHaveLength(2));
  });
});
