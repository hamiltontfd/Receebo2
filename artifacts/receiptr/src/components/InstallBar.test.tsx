import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signedIn: true, receipts: [{ id: 1 }] as unknown[] }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: mocks.signedIn }) }));
vi.mock("@workspace/api-client-react", () => ({
  getGetRecentReceiptsQueryKey: (params: unknown) => ["recent", params],
  useGetRecentReceipts: () => ({ data: mocks.signedIn ? mocks.receipts : undefined }),
}));

import InstallBar from "./InstallBar";
import { resetInstallStateForTests } from "@/lib/pwa";
import { INSTALL_DISMISS_KEY, INSTALL_DISMISS_MS, shouldShowInstallBar } from "@/lib/installPrompt";
import { LOCALE_STORAGE_KEY } from "@/lib/locale";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
let standalone = false;

beforeEach(() => {
  mocks.signedIn = true;
  mocks.receipts = [{ id: 1 }];
  standalone = false;
  localStorage.clear();
  resetInstallStateForTests();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: IPHONE_SAFARI });
  Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
});

const bar = () => screen.queryByTestId("install-bar");
function offerInstall(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => { window.dispatchEvent(event); });
  return { event, prompt };
}

describe("install bar show rules", () => {
  it("is shown to a signed-in user with a saved receipt on a phone", () => {
    render(<InstallBar />);
    expect(bar()).toBeInTheDocument();
    expect(screen.getByText("Install Receebo on your phone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
  });
  it("shows the current Receebo mark, not the legacy app icon", () => {
    render(<InstallBar />);
    const logo = bar()!.querySelector("img")!;
    expect(logo.getAttribute("src")).toMatch(/logo-mark\.svg$/);
    expect(logo.getAttribute("alt")).toBe("");
  });
  it("is hidden for signed-out visitors", () => {
    mocks.signedIn = false;
    render(<InstallBar />);
    expect(bar()).not.toBeInTheDocument();
  });
  it("is hidden until the first receipt is saved", () => {
    mocks.receipts = [];
    render(<InstallBar />);
    expect(bar()).not.toBeInTheDocument();
  });
  it.each(["display-mode", "navigator.standalone"])("is hidden when running standalone (%s)", (how) => {
    if (how === "display-mode") standalone = true;
    else Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    render(<InstallBar />);
    expect(bar()).not.toBeInTheDocument();
  });
  it("hides for 30 days after X and comes back afterwards", () => {
    const first = render(<InstallBar />);
    act(() => screen.getByRole("button", { name: "Dismiss" }).click());
    expect(bar()).not.toBeInTheDocument();
    const saved = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
    expect(saved).toBeGreaterThan(0);
    first.unmount();
    render(<InstallBar />);
    expect(bar()).not.toBeInTheDocument();
    const now = Date.now();
    expect(shouldShowInstallBar({ signedIn: true, receiptCount: 1, standalone: false, canInstall: true,
      dismissedAt: now - INSTALL_DISMISS_MS + 60_000, now })).toBe(false);
    expect(shouldShowInstallBar({ signedIn: true, receiptCount: 1, standalone: false, canInstall: true,
      dismissedAt: now - INSTALL_DISMISS_MS - 1, now })).toBe(true);
  });
  it("is hidden on desktop browsers without a native prompt", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0" });
    render(<InstallBar />);
    expect(bar()).not.toBeInTheDocument();
  });
  it("is hidden while offline", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<InstallBar />);
    expect(bar()).not.toBeInTheDocument();
  });
  it("uses pt-BR and pt-PT copy when that locale is selected", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    const view = render(<InstallBar />);
    expect(screen.getByText("Instale o Receebo no seu celular")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Instalar" })).toBeInTheDocument();
    view.unmount();
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-PT");
    render(<InstallBar />);
    expect(screen.getByText("Instale o Receebo no seu telemóvel")).toBeInTheDocument();
  });
});

describe("install action", () => {
  it("calls the native prompt when the browser offered one", async () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: ANDROID });
    render(<InstallBar />);
    const { event, prompt } = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => screen.getByRole("button", { name: "Install" }).click());
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens the Safari steps on iPhone", async () => {
    render(<InstallBar />);
    await act(async () => screen.getByRole("button", { name: "Install" }).click());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Choose Add to Home Screen.");
    expect(dialog).toHaveTextContent("Tap Add.");
    expect(screen.getByRole("img", { name: "Share" })).toBeInTheDocument();
  });
  it("tells other iPhone browsers to open Safari", async () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: IPHONE_CHROME });
    render(<InstallBar />);
    await act(async () => screen.getByRole("button", { name: "Install" }).click());
    expect(screen.getByRole("dialog")).toHaveTextContent("Open this page in Safari");
  });
  it("shows generic menu steps on other phones without a native prompt", async () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: ANDROID });
    render(<InstallBar />);
    await act(async () => screen.getByRole("button", { name: "Install" }).click());
    expect(screen.getByRole("dialog")).toHaveTextContent("Choose Install app or Add to Home screen.");
  });
  it("hides after a successful install", () => {
    render(<InstallBar />);
    expect(bar()).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(bar()).not.toBeInTheDocument();
  });
});
