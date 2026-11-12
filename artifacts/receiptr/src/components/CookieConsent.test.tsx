import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CookieConsent, SharingOptOutButton } from "./CookieConsent";
import { acceptAll, CONSENT_STORAGE_KEY } from "@/lib/adConsent";

describe("cookie banner", () => {
  it("the US footer control immediately persists an opt-out, revokes Pixel and confirms it", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll()));
    const revoke = vi.fn();
    window.fbq = revoke;
    document.cookie = "_fbp=test; Path=/";
    document.cookie = "_fbc=test; Path=/";
    localStorage.setItem("receebo:ad-attribution", "test-attribution");
    localStorage.setItem("receebo:app-open:test-account", "2026-11-12");
    const script = document.createElement("script");
    script.id = "meta-pixel";
    document.head.append(script);
    render(<><SharingOptOutButton /><CookieConsent region="US" /></>);
    fireEvent.click(screen.getByRole("button", { name: /do not sell or share my personal information/i }));
    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!);
    expect(stored).toMatchObject({ essential: true, marketing: false, attribution: false, choice: "preferences" });
    expect(revoke).toHaveBeenCalledWith("consent", "revoke");
    expect(document.getElementById("meta-pixel")).toBeNull();
    expect(document.cookie).not.toMatch(/_fbp=|_fbc=/);
    expect(localStorage.getItem("receebo:ad-attribution")).toBeNull();
    expect(localStorage.getItem("receebo:app-open:test-account")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Your opt-out is saved");
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
    delete window.fbq;
    localStorage.clear();
  });
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
