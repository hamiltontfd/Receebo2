import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import PwaStatus from "@/components/PwaStatus";
import OfflineStartup from "@/components/OfflineStartup";
import { hasPwaWork, isInstalled, isIosSafari, isIosChrome, usePwaUpdateBlocker } from "./pwa";
import { isAppNavigation } from "./navigationRoutes";
import { privateFileUrl } from "./privateFileUrl";

let standalone = false;
beforeEach(() => {
  standalone = false;
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Chrome Desktop" });
  Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
});

function Blocker({ active }: { active: boolean }) {
  usePwaUpdateBlocker(active);
  return null;
}
function mountStatus(blocked = false) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><Router>
    <Blocker active={blocked} /><PwaStatus />
  </Router></QueryClientProvider>);
}
function offerInstall() {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  act(() => { window.dispatchEvent(event); });
  return { event, prompt };
}

describe("installation guidance", () => {
  function useIphoneChrome() {
    Object.defineProperty(navigator, "userAgent", { value: "iPhone OS 18_0 CriOS/130.0 Mobile Safari/604.1" });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
    vi.stubGlobal("isSecureContext", true);
  }
  it("shows manual Chrome instructions on iPhone without a native install prompt", () => {
    useIphoneChrome();
    expect(isIosChrome()).toBe(true);
    mountStatus();
    expect(screen.getByText(/in Chrome, tap Share beside the address bar/)).toHaveTextContent("If the option is missing, open this page in Safari");
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Not now" }).click());
    expect(screen.queryByText(/in Chrome, tap Share/)).not.toBeInTheDocument();
  });
  it.each(["installed", "busy", "offline", "insecure"] as const)("hides iPhone Chrome guidance when %s", (state) => {
    useIphoneChrome();
    if (state === "installed") standalone = true;
    if (state === "offline") Object.defineProperty(navigator, "onLine", { value: false });
    if (state === "insecure") vi.stubGlobal("isSecureContext", false);
    mountStatus(state === "busy");
    expect(screen.queryByText(/in Chrome, tap Share/)).not.toBeInTheDocument();
  });
  it("does not show Chrome instructions during sign-in", () => {
    useIphoneChrome();
    window.history.replaceState({}, "", "/sign-in");
    try {
      mountStatus();
      expect(screen.queryByText(/in Chrome, tap Share/)).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
  it("does not offer install in unsupported browsers", () => {
    mountStatus();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
  });
  it("uses the supported browser event and only prompts on a click", async () => {
    mountStatus();
    const { event, prompt } = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => screen.getByRole("button", { name: "Install" }).click());
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });
  it("hides install when already installed and after appinstalled", () => {
    standalone = true;
    expect(isInstalled()).toBe(true);
    mountStatus();
    offerInstall();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });
  it("handles installing while the page remains open", () => {
    mountStatus();
    offerInstall();
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });
  it("does not interrupt a scan with installation guidance", () => {
    mountStatus(true);
    offerInstall();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });
  it("detects Safari on iPhone, but not embedded or other iOS browsers", () => {
    Object.defineProperty(navigator, "userAgent", { value: "iPhone Version/18 Mobile Safari/604.1" });
    expect(isIosSafari()).toBe(true);
    expect(isIosChrome()).toBe(false);
    Object.defineProperty(navigator, "userAgent", { value: "iPhone CriOS/125 Mobile Safari/604.1" });
    expect(isIosSafari()).toBe(false);
    Object.defineProperty(navigator, "userAgent", { value: "iPhone Mobile AppleWebKit/605.1" });
    expect(isIosSafari()).toBe(false);
    expect(isIosChrome()).toBe(false);
    Object.defineProperty(navigator, "userAgent", { value: "Android Chrome/130 Mobile Safari/537.36" });
    expect(isIosChrome()).toBe(false);
  });
});

describe("update work guards", () => {
  it("keeps independent blockers and releases them on unmount", () => {
    const first = render(<Blocker active />);
    const second = render(<Blocker active />);
    expect(hasPwaWork()).toBe(true);
    first.unmount();
    expect(hasPwaWork()).toBe(true);
    second.rerender(<Blocker active={false} />);
    expect(hasPwaWork()).toBe(false);
  });
});

describe("offline messaging", () => {
  it("explains offline limits without claiming saved or queued work", () => {
    mountStatus();
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByText(/Changes are not queued or saved offline/)).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.queryByText(/You’re offline/)).not.toBeInTheDocument();
  });
  it("provides a standalone offline entry without auth or receipt data", () => {
    render(<OfflineStartup />);
    expect(screen.getByRole("heading", { name: "Receebo is offline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is queued or saved offline/)).toBeInTheDocument();
  });
});

describe("navigation privacy", () => {
  it.each(["/", "/search", "/scan", "/receipts/42", "/privacy", "/terms"])("caches the shell for %s", (path) => {
    expect(isAppNavigation(path, "/")).toBe(true);
    expect(isAppNavigation(`/receebo${path}`, "/receebo/")).toBe(true);
  });
  it.each(["/api/receipts", "/api/storage/objects/secret", "/api/billing/status", "/api/auth/callback",
    "/__clerk/v1/client", "/sign-in/sso-callback", "/sign-up", "/mobile/", "/__mockup/", "/unknown", "/file.pdf"])(
    "does not replace %s with SPA HTML", (path) => {
      expect(isAppNavigation(path, "/")).toBe(false);
      expect(isAppNavigation(`/receebo${path}`, "/receebo/")).toBe(false);
    },
  );
  it("migrates file links away from legacy cache entries", () => {
    expect(privateFileUrl("/objects/example")).toContain("?private-cache=no-store");
  });
});
