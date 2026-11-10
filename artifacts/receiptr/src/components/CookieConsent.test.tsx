import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CookieConsent } from "./CookieConsent";
import { CONSENT_STORAGE_KEY } from "@/lib/adConsent";

describe("cookie banner", () => {
  it("starts with non-essential cookies off in the EU and lets the person accept or reject", () => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    render(<CookieConsent region="EU" />);
    expect(screen.getByTestId("cookie-banner").textContent).toMatch(/stay off until you accept/i);
    fireEvent.click(screen.getByTestId("cookie-reject"));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "{}").marketing).toBe(false);
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  });

  it("offers an opt-out notice in the US and stores a rejection", () => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    render(<CookieConsent region="US" />);
    expect(screen.getByTestId("cookie-banner").textContent).toMatch(/opt out of sale or sharing/i);
    fireEvent.click(screen.getByTestId("cookie-preferences"));
    expect(screen.getByTestId("cookie-preferences-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cookie-reject"));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "{}").choice).toBe("reject");
  });

  it("treats Global Privacy Control as an opt-out of marketing before a choice", () => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    vi.stubGlobal("navigator", { ...navigator, globalPrivacyControl: true });
    render(<CookieConsent region="US" />);
    fireEvent.click(screen.getByTestId("cookie-preferences"));
    const boxes = screen.getAllByRole("checkbox");
    const marketing = boxes[boxes.length - 1] as HTMLInputElement;
    expect(marketing.checked).toBe(false);
    vi.unstubAllGlobals();
  });
});
