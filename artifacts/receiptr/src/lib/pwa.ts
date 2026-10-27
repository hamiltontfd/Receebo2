import { useLayoutEffect } from "react";

const blockers = new Set<symbol>();
const listeners = new Set<() => void>();
export const hasPwaWork = () => blockers.size > 0;
export const subscribePwaWork = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function usePwaUpdateBlocker(blocked: boolean) {
  useLayoutEffect(() => {
    if (!blocked) return;
    const token = Symbol();
    blockers.add(token);
    listeners.forEach((listener) => listener());
    return () => {
      blockers.delete(token);
      listeners.forEach((listener) => listener());
    };
  }, [blocked]);
}

export function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function isIosChrome() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    /CriOS\//.test(navigator.userAgent);
}

let registration: ServiceWorkerRegistration | undefined;
const updateListeners = new Set<() => void>();
export const getWaitingWorker = () => registration?.waiting ?? null;
export const subscribeUpdate = (listener: () => void) => {
  updateListeners.add(listener);
  return () => { updateListeners.delete(listener); };
};

export async function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  try {
    registration = await navigator.serviceWorker.register(
      import.meta.env.DEV ? `${base}dev-sw.js?dev-sw` : `${base}sw.js`,
      { scope: base, type: "module", updateViaCache: "none" },
    );
    const notify = () => updateListeners.forEach((listener) => listener());
    notify();
    registration.addEventListener("updatefound", () => {
      registration?.installing?.addEventListener("statechange", notify);
    });
    // Check on return to the app; never activate on visibility/network events.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void registration?.update().catch(() => {});
      }
    });
  } catch (error) {
    console.error("[PWA] Service worker registration failed", error);
  }
}

export async function requestUpdate(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => { channel.port1.close(); resolve(false); }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data?.accepted === true);
    };
    worker.postMessage({ type: "APPLY_UPDATE" }, [channel.port2]);
  });
}

/** Chromium's deferred install prompt (beforeinstallprompt). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Captured from page load (main.tsx) so the prompt is not lost before the
// signed-in app mounts the install bar.
let installEvent: InstallPromptEvent | null = null;
let appInstalled = false;
let capturing = false;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((listener) => listener());
export const getInstallEvent = () => installEvent;
export const wasAppInstalled = () => appInstalled;
export const subscribeInstall = (listener: () => void) => {
  installListeners.add(listener);
  return () => { installListeners.delete(listener); };
};
export function clearInstallEvent() {
  installEvent = null;
  notifyInstall();
}
export function startInstallCapture() {
  if (capturing || typeof window === "undefined") return;
  capturing = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event as InstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    appInstalled = true;
    installEvent = null;
    notifyInstall();
  });
}
/** Test-only: forget captured install state between cases. */
export function resetInstallStateForTests() {
  installEvent = null;
  appInstalled = false;
  notifyInstall();
}
