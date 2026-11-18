import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContextType } from "react";
import { MarketContext } from "./MarketProvider";
import { CookieConsent } from "./CookieConsent";
import { AdsRuntime, isPublicMetaPage } from "./AdsRuntime";
import { acceptAll, emptyConsent, CONSENT_CHANGED, CONSENT_STORAGE_KEY } from "@/lib/adConsent";
import { en, pt } from "@/pages/cookies";
import { captureAllowedFirstTouch } from "@/lib/adAttribution";

const { send, auth } = vi.hoisted(() => ({ send: vi.fn(async (_path: string, _options?: RequestInit) => ({ created: false })), auth: { isSignedIn: false, userId: null as string | null } }));
const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("wouter", async importOriginal => ({
  ...await importOriginal<typeof import("wouter")>(),
  useLocation: () => [navigation.path, vi.fn()],
}));
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
vi.mock("@workspace/api-client-react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/api-client-react")>(), customFetch: send,
}));
vi.mock("@/components/LegalPageLayout", () => ({ LegalPageLayout: ({ children }: { children: unknown }) => children }));

beforeEach(() => {
  localStorage.clear();
  send.mockReset().mockResolvedValue({ created: false });
  window.history.replaceState({}, "", "/");
  navigation.path = "/";
  auth.isSignedIn = false; auth.userId = null;
  vi.stubEnv("VITE_META_PIXEL_ID", "test-pixel");
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete window.fbq; delete window._fbq;
  document.getElementById("meta-pixel")?.remove();
});
function view(country: string | null, banner = true) {
  return render(<MarketContext.Provider value={{ country } as ContextType<typeof MarketContext>}>
    {banner && <CookieConsent region={country === "US" ? "US" : country ? "EU" : "UNKNOWN"} />}
    <AdsRuntime />
  </MarketContext.Provider>);
}
describe("live cookie choices", () => {
  it("syncs a first touch written synchronously by a CTA, but not a repeated click or plain navigation", async () => {
    auth.isSignedIn = true; auth.userId = "synthetic-cta-captured";
    const mounted = view("US", false);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    act(() => { captureAllowedFirstTouch(true, "?utm_source=meta&utm_campaign=cta"); });
    await waitFor(() => expect(send.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1));
    const count = send.mock.calls.length;
    act(() => { captureAllowedFirstTouch(true, "?utm_source=meta&utm_campaign=other"); });
    navigation.path = "/search";
    mounted.rerender(<MarketContext.Provider value={{ country: "US" } as ContextType<typeof MarketContext>}><AdsRuntime /></MarketContext.Provider>);
    await act(async () => { await Promise.resolve(); });
    expect(send).toHaveBeenCalledTimes(count);
    expect(JSON.parse(String(send.mock.calls.find(call => call[1]?.method === "POST")![1]?.body))).toMatchObject({ utmCampaign: "cta" });
  });
  it("shows the account banner only after persistent non-auth failures exhaust four retries", async () => {
    vi.useFakeTimers();
    try {
      auth.isSignedIn = true; auth.userId = "synthetic-persistent-failure";
      send.mockRejectedValue({ status: 400 });
      view("US", false);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(send).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      for (const delay of [500, 1000, 2000]) {
        await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      }
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(send).toHaveBeenCalledTimes(5);
      expect(screen.getByRole("alert")).toHaveTextContent("account marketing consent could not be updated");
    } finally { vi.useRealTimers(); }
  });
  it("does not resend attribution or consent on plain navigation; retry triggers still sync consent", async () => {
    auth.isSignedIn = true; auth.userId = "synthetic-navigation";
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll()));
    const raw = JSON.stringify({ utmSource: "navigation", capturedAt: new Date().toISOString() });
    localStorage.setItem("receebo:ad-attribution", raw);
    const ui = () => <MarketContext.Provider value={{ country: "US" } as ContextType<typeof MarketContext>}><AdsRuntime /></MarketContext.Provider>;
    const mounted = render(ui());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    for (const path of ["/search", "/scan", "/settings"]) {
      navigation.path = path;
      window.history.replaceState({}, "", path);
      await act(async () => mounted.rerender(ui()));
    }
    expect(send).toHaveBeenCalledTimes(2);
    for (const event of ["online", "focus", "receebo:legal-accepted"]) {
      const count = send.mock.calls.length;
      act(() => window.dispatchEvent(new Event(event)));
      await waitFor(() => expect(send).toHaveBeenCalledTimes(count + 1));
    }
    expect(send.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    expect(localStorage.getItem("receebo:ad-attribution")).toBe(raw);
    mounted.unmount();
    // Remounting in the same browser session does not resend the same user/touch.
    render(ui());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(6));
    expect(send.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });
  it("syncs a newly written touch on navigation, and scopes successful POSTs by user", async () => {
    auth.isSignedIn = true; auth.userId = "synthetic-new-touch";
    const ui = () => <MarketContext.Provider value={{ country: "US" } as ContextType<typeof MarketContext>}><AdsRuntime /></MarketContext.Provider>;
    const mounted = render(ui());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    navigation.path = "/pricing";
    window.history.replaceState({}, "", "/pricing?utm_source=new-touch");
    mounted.rerender(ui());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    auth.userId = "synthetic-other-account";
    mounted.rerender(ui());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(5));
    expect(send.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(2);
  });
  it("does not POST attribution until the consent PATCH succeeds", async () => {
    auth.isSignedIn = true; auth.userId = "synthetic-patch-retry";
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll()));
    localStorage.setItem("receebo:ad-attribution", JSON.stringify({ utmSource: "patch-retry", capturedAt: new Date().toISOString() }));
    send.mockRejectedValueOnce({ status: 401 });
    view("PT", false);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][1]?.method).toBe("PATCH");
    expect(send.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(0);
    act(() => window.dispatchEvent(new Event("receebo:legal-accepted")));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    expect(send.mock.calls.filter(call => call[1]?.method === "PATCH")).toHaveLength(2);
  });
  it("keeps the initial campaign in memory until US GeoIP resolves after navigation to sign-up", async () => {
    window.history.replaceState({}, "", "/us?utm_source=meta&utm_medium=paid_social&utm_campaign=US_Validacao_2026-11&utm_content=TEST_E2E&utm_term=AS_Broad&fbclid=synthetic-click");
    const first = view(null, false);
    expect(localStorage.getItem("receebo:ad-attribution")).toBeNull();
    window.history.replaceState({}, "", "/sign-up");
    first.unmount();
    const signedUp = view("US", false);
    const saved = JSON.parse(localStorage.getItem("receebo:ad-attribution")!);
    expect(saved).toMatchObject({
      utmSource: "meta", utmMedium: "paid_social", utmCampaign: "US_Validacao_2026-11",
      utmContent: "TEST_E2E", utmTerm: "AS_Broad", fbclid: "synthetic-click",
    });
    signedUp.unmount();
    // Clerk sign-in rekeys MarketScope and briefly makes the country unknown.
    auth.isSignedIn = true; auth.userId = "synthetic-signup";
    const hydrating = view(null, false);
    expect(JSON.parse(localStorage.getItem("receebo:ad-attribution")!)).toEqual(saved);
    expect(send).not.toHaveBeenCalled();
    hydrating.unmount();
    view("US", false);
    await waitFor(() => expect(send).toHaveBeenCalledWith(
      expect.stringMatching(/\/account\/attribution$/),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ...saved, marketingConsent: true }) }),
    ));
  });
  it("does not persist a pending campaign for an EU visitor without consent, or after Reject", () => {
    window.history.replaceState({}, "", "/?utm_source=synthetic-eu");
    const pending = view("PT", false);
    expect(localStorage.getItem("receebo:ad-attribution")).toBeNull();
    pending.unmount();
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(emptyConsent()));
    const rejected = view("US", false);
    expect(localStorage.getItem("receebo:ad-attribution")).toBeNull();
    rejected.unmount();
  });
  it("retries first-touch after legal acceptance instead of swallowing its failed POST", async () => {
    auth.isSignedIn = true; auth.userId = "synthetic-pending-legal";
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll()));
    const touch = { utmSource: "synthetic", capturedAt: new Date().toISOString() };
    localStorage.setItem("receebo:ad-attribution", JSON.stringify(touch));
    send.mockResolvedValueOnce({ created: false }).mockRejectedValueOnce({ status: 428 });
    view("PT", false);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0][0]).toMatch(/\/account\/attribution\/consent$/);
    expect(send.mock.calls[1][0]).toMatch(/\/account\/attribution$/);
    // 428 is a legal wait, not a timed retry or a consent-error banner.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("receebo:legal-accepted")));
    await waitFor(() => expect(send).toHaveBeenCalledWith(
      expect.stringContaining("/attribution/consent"), expect.anything(),
    ));
    expect(send.mock.calls.filter(call => /\/account\/attribution$/.test(call[0]))).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("permits PageView only on explicit public pages, never authenticated routes", () => {
    for (const path of ["/", "/us", "/pricing", "/privacy", "/cookies", "/terms"]) expect(isPublicMetaPage(path)).toBe(true);
    for (const path of ["/search", "/scan", "/receipts/123", "/settings", "/imports", "/stats", "/profile"]) expect(isPublicMetaPage(path)).toBe(false);
  });
  it("synchronizes a US GPC opt-out to the signed-in account", async () => {
    auth.isSignedIn = true; auth.userId = "synthetic-gpc";
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true });
    try {
      view("US");
      expect(screen.getByTestId("gpc-notice")).toHaveTextContent("Your browser's Global Privacy Control signal is honored.");
      await waitFor(() => expect(send).toHaveBeenCalledWith(expect.stringContaining("/attribution/consent"), expect.objectContaining({ body: '{"marketingConsent":false}' })));
    } finally { Object.defineProperty(navigator, "globalPrivacyControl", { value: false, configurable: true }); }
  });
  it("does not emit registration when attribution is first saved", async () => {
    auth.isSignedIn = true; auth.userId = "account-test";
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll()));
    localStorage.setItem("receebo:ad-attribution", JSON.stringify({ utmSource: "test", capturedAt: new Date().toISOString() }));
    send.mockResolvedValueOnce({ created: true });
    const fbq = Object.assign(vi.fn(), { loaded: true });
    window.fbq = fbq;
    view("PT", false);
    await waitFor(() => expect(send).toHaveBeenCalledWith(
      expect.stringContaining("/account/attribution"), expect.anything(),
    ));
    await waitFor(() => expect(send).toHaveBeenCalledWith(
      expect.stringContaining("/account/attribution/consent"), expect.anything(),
    ));
    expect(fbq.mock.calls.some(call => call[1] === "CompleteRegistration")).toBe(false);
  });
  it.each(["PT", "IS", "LI", "NO", "GB", "CH", "BR", null])("keeps Meta off before a choice in %s", (country) => {
    view(country);
    expect(document.getElementById("meta-pixel")).toBeNull();
  });
  it.each([
    { ...acceptAll() },
    { ...emptyConsent() },
    { ...acceptAll(), choice: "preferences" as const },
    { ...acceptAll(), choice: "preferences" as const, marketing: false },
  ])("syncs explicit $choice marketing=$marketing even with unknown country", async stored => {
    auth.isSignedIn = true; auth.userId = "account-test";
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
    window.fbq = Object.assign(vi.fn(), { loaded: true });
    view(null, false);
    await waitFor(() => expect(send).toHaveBeenCalledWith(
      expect.stringContaining("/attribution/consent"),
      expect.objectContaining({ body: JSON.stringify({ marketingConsent: stored.marketing }) }),
    ));
    if (stored.marketing) expect(window.fbq).toHaveBeenCalledWith("consent", "grant");
    else expect(window.fbq).toHaveBeenCalledWith("consent", "revoke");
  });
  it("does not sync implied defaults for a signed-in user with unknown country", async () => {
    auth.isSignedIn = true; auth.userId = "account-test";
    await act(async () => { view(null, false); });
    expect(send).not.toHaveBeenCalled();
    expect(document.getElementById("meta-pixel")).toBeNull();
  });
  it("US loads then Reject revokes immediately and deletes Meta and attribution cookies/storage", async () => {
    const calls: unknown[][] = [];
    window.fbq = Object.assign((...args: unknown[]) => calls.push(args), { loaded: true });
    localStorage.setItem("receebo:ad-attribution", '{"fbclid":"sample"}');
    document.cookie = "_fbp=test; Path=/"; document.cookie = "_fbc=test; Path=/";
    document.cookie = "receebo:ad-attribution=test; Path=/";
    view("US");
    expect(calls.some(c => c[0] === "track")).toBe(true);
    fireEvent.click(screen.getByTestId("cookie-reject"));
    await waitFor(() => expect(calls).toContainEqual(["consent", "revoke"]));
    expect(document.cookie).not.toMatch(/_fbp=|_fbc=|receebo:ad-attribution=/);
    expect(localStorage.getItem("receebo:ad-attribution")).toBeNull();
    const count = calls.filter(c => c[0] === "track").length;
    window.dispatchEvent(new Event(CONSENT_CHANGED));
    expect(calls.filter(c => c[0] === "track")).toHaveLength(count);
  });
  it("Preferences marketing off revokes and serializes accept/reject account updates without first-touch", async () => {
    auth.isSignedIn = true; auth.userId = "account-test";
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll()));
    window.fbq = Object.assign(vi.fn(), { loaded: true });
    view("PT");
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.stringContaining("/attribution/consent"), expect.objectContaining({ body: '{"marketingConsent":true}' })));
    window.dispatchEvent(new Event("receebo:open-cookie-settings"));
    await screen.findByTestId("cookie-preferences-panel");
    fireEvent.click(screen.getByRole("checkbox", { name: /Marketing/ }));
    fireEvent.click(screen.getByTestId("cookie-save"));
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.stringContaining("/attribution/consent"), expect.objectContaining({ body: '{"marketingConsent":false}' })));
    expect(window.fbq).toHaveBeenCalledWith("consent", "revoke");
    expect(send.mock.calls.every(c => !String(c[0]).endsWith("/account/attribution"))).toBe(true);
  });
});
it("documents all missing storage in EN/PT and labels the consent choice essential", () => {
  for (const rows of [en, pt]) {
    for (const name of ["receebo:visitorMarket", "receebo:installBarDismissedAt", "receebo:marketInterestSent:${country}", "receebo:onboarding:pending:${userId}", "__clerk_environment", "Service worker cache", "GAESA", "Landing event beacon"]) {
      expect(rows.some(r => r.name === name)).toBe(true);
    }
    expect(rows.find(r => r.name === CONSENT_STORAGE_KEY)?.party).toMatch(/essential|essencial/);
    expect(rows.find(r => r.name === "Landing event beacon")?.purpose).toMatch(/no browser identifier|sem identificador/);
  }
});
