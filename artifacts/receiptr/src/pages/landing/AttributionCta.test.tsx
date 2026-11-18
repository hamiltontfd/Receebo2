import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MarketContext } from "@/components/MarketProvider";
import type { MarketState } from "@/components/MarketProvider";
import { useLandingCta } from "./useLandingCta";
import { ATTRIBUTION_STORAGE_KEY, campaignSignUpHref } from "@/lib/adAttribution";
import { CONSENT_STORAGE_KEY, emptyConsent } from "@/lib/adConsent";
vi.mock("@/lib/landingBeacon", () => ({ sendLandingEvent: vi.fn() }));
function Cta() {
  const action = useLandingCta("/us");
  return <a href={action.href} onClick={event => { action(); event.preventDefault(); }}>Start free</a>;
}
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/us?utm_source=meta&utm_medium=paid_social&utm_campaign=trial&utm_content=sample&utm_term=broad&fbclid=synthetic-click&private=omit");
});
afterEach(() => window.history.replaceState({}, "", "/"));
it("writes the allowed first touch in the click before navigation and carries only campaign query keys", () => {
  render(<MarketContext.Provider value={{ country: "US", confirmed: true } as MarketState}><Cta /></MarketContext.Provider>);
  expect(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
  expect(screen.getByRole("link")).toHaveAttribute("href", "/sign-up?utm_source=meta&utm_medium=paid_social&utm_campaign=trial&utm_content=sample&utm_term=broad&fbclid=synthetic-click&landing=us");
  fireEvent.click(screen.getByRole("link"));
  const touch = JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)!);
  expect(touch).toMatchObject({ utmSource: "meta", utmCampaign: "trial", fbclid: "synthetic-click" });
  expect(document.cookie).toContain(ATTRIBUTION_STORAGE_KEY);
  // After Clerk drops URL parameters the persisted touch is still present.
  window.history.replaceState({}, "", "/search");
  expect(JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)!)).toEqual(touch);
});
it.each(["PT", null])("does not persist before opt-in for country %s", country => {
  render(<MarketContext.Provider value={{ country, confirmed: true } as MarketState}><Cta /></MarketContext.Provider>);
  fireEvent.click(screen.getByRole("link"));
  expect(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
});
it("never overrides a reject even on /us and never carries arbitrary query parameters", () => {
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(emptyConsent()));
  render(<MarketContext.Provider value={{ country: "US", confirmed: true } as MarketState}><Cta /></MarketContext.Provider>);
  fireEvent.click(screen.getByRole("link"));
  expect(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
  expect(campaignSignUpHref("?q=private&fbclid=synthetic")).toBe("/sign-up?fbclid=synthetic");
});

it("does not choose or adopt a market from the US background on an auth page", () => {
  window.history.replaceState({}, "", "/sign-up?landing=us");
  const choose = vi.fn();
  render(<MarketContext.Provider value={{ country: "PT", confirmed: false, choose } as unknown as MarketState}><Cta /></MarketContext.Provider>);
  fireEvent.click(screen.getByRole("link"));
  expect(choose).not.toHaveBeenCalled();
});
