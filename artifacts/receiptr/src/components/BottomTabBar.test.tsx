import { act, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  billing: { plan: "free", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 3 } as Record<string, unknown>,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useBilling", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useBilling")>("@/hooks/useBilling");
  return { ...actual, useBillingStatus: () => ({ data: mocks.billing, refetch: vi.fn() }) };
});
import { BottomTabBar } from "./BottomTabBar";
import { getLastTab, hasPendingUpload, hidesTabBar, rememberTab, subPageFor, takePendingUpload } from "@/lib/navState";

function mount(path: string, pendingDot = false) {
  const loc = memoryLocation({ path, record: true });
  const utils = render(<Router hook={loc.hook}><BottomTabBar pendingDot={pendingDot} /></Router>);
  return { ...utils, loc };
}

beforeEach(() => {
  mocks.billing = { plan: "free", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 3 };
  takePendingUpload();
});
afterEach(() => { vi.clearAllMocks(); });

describe("mobile tab bar", () => {
  it("shows Search · Add · Stats with Search active on /search", () => {
    mount("/search");
    expect(screen.getByTestId("tab-search")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("tab-stats")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("tab-add")).toHaveAccessibleName("Add receipt");
    expect(screen.getByText("Add")).toBeInTheDocument();
    expect(document.documentElement.dataset.tabbar).toBe("1");
  });
  it("has no active tab on the avatar's pages", () => {
    mount("/profile");
    expect(screen.getByTestId("tab-search")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("tab-stats")).not.toHaveAttribute("aria-current");
  });
  it("shows the pending dot on Search only when on another tab", () => {
    const a = mount("/search", true);
    expect(screen.queryByTestId("search-pending-dot")).toBeNull();
    a.unmount();
    mount("/stats", true);
    expect(screen.getByTestId("search-pending-dot")).toBeInTheDocument();
  });
  it("Add opens the sheet (the + turns into an X) and Scan receipt goes to the camera", () => {
    const { loc } = mount("/stats");
    fireEvent.click(screen.getByTestId("tab-add"));
    expect(screen.getByTestId("add-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("tab-add")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("tab-add")).toHaveAccessibleName("Close add menu");
    expect(screen.getByText("Use your camera")).toBeInTheDocument();
    expect(screen.getByText("Photo or PDF from your device")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("add-scan"));
    expect(screen.queryByTestId("add-sheet")).toBeNull();
    expect(loc.history?.at(-1)).toBe("/scan");
  });
  it("closes the sheet with Escape or the scrim", () => {
    mount("/search");
    fireEvent.click(screen.getByTestId("tab-add"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("add-sheet")).toBeNull();
    fireEvent.click(screen.getByTestId("tab-add"));
    fireEvent.click(screen.getByTestId("add-sheet-scrim"));
    expect(screen.queryByTestId("add-sheet")).toBeNull();
  });
  it("Upload file opens the JPG/PNG/PDF picker and hands the file to /scan", () => {
    const { loc, container } = mount("/search");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe("image/jpeg,image/png,application/pdf");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByTestId("tab-add"));
    fireEvent.click(screen.getByTestId("add-upload"));
    expect(click).toHaveBeenCalled();
    const file = new File(["x"], "receipt.pdf", { type: "application/pdf" });
    act(() => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(hasPendingUpload()).toBe(true);
    expect(takePendingUpload()).toBe(file);
    expect(loc.history?.at(-1)).toBe("/scan");
  });
  it("refuses Upload file before the picker when uploads are used up", () => {
    mocks.billing = { plan: "free", accessState: "trial_exhausted", canUseApp: true, canUpload: false, trialUploadsUsed: 5 };
    const { container } = mount("/search");
    const click = vi.spyOn(container.querySelector('input[type="file"]') as HTMLInputElement, "click");
    fireEvent.click(screen.getByTestId("tab-add"));
    fireEvent.click(screen.getByTestId("add-upload"));
    expect(click).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Upload not available" }));
  });
});

describe("nav state", () => {
  it("remembers the last tab for the camera's X", () => {
    rememberTab("/stats");
    expect(getLastTab()).toBe("/stats");
    rememberTab("/profile");
    expect(getLastTab()).toBe("/stats");
    rememberTab("/search");
    expect(getLastTab()).toBe("/search");
  });
  it("hides the tab bar only on /scan and titles the avatar's pages", () => {
    expect(hidesTabBar("/scan")).toBe(true);
    expect(hidesTabBar("/search")).toBe(false);
    expect(subPageFor("/profile")).toEqual({ title: "Profile", back: null });
    expect(subPageFor("/settings")).toEqual({ title: "Settings", back: "/profile" });
    expect(subPageFor("/profile/recurring")).toEqual({ title: "Recurring suppliers", back: "/profile" });
    expect(subPageFor("/search")).toBeNull();
  });
});
