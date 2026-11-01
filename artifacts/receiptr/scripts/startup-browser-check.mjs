// Run against the existing Vite workflow. Only this browser receives the auth
// fixture; every API call is intercepted, so no accounts or trials are changed.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.env.STARTUP_TEST_ORIGIN || "http://localhost:5000";
const output = resolve(import.meta.dirname, "../../../generated-artifacts/startup");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PWA_CHROMIUM_PATH || "/repl/tools/bin/chromium",
  args: ["--no-sandbox"],
});
const clerkFixture = `
import React from "/node_modules/.vite/deps/react.js";
const listeners = new Set();
window.startupAuthReady = false;
window.finishStartupAuth = () => {
  window.startupAuthReady = true;
  listeners.forEach(listener => listener());
};
export function useAuth() {
  const ready = React.useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => window.startupAuthReady
  );
  return { isLoaded: ready, isSignedIn: ready, userId: ready ? "startup-fixture" : null };
}
const clerk = { addListener: () => () => {}, signOut: () => {} };
export const useClerk = () => clerk;
export const useUser = () => ({ user: { id: "startup-fixture", fullName: "Startup fixture" } });
export const ClerkProvider = ({ children }) => children;
export function Show({ when, children }) {
  const auth = useAuth();
  return auth.isLoaded && (when === "signed-in") === auth.isSignedIn ? children : null;
}
export const SignIn = () => null;
export const SignUp = () => null;
`;
const entitlement = (started) => ({
  plan: "free", accessState: started ? "account_trial" : "not_started",
  canUseApp: started, canUpload: started, trialUploadsRemaining: 5,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

try {
  for (const scenario of [
    { name: "desktop", viewport: { width: 1280, height: 800 }, locale: "en-US", reducedMotion: "no-preference" },
    { name: "small-pwa-reduced", viewport: { width: 320, height: 568 }, locale: "pt-PT", reducedMotion: "reduce" },
  ]) {
    const context = await browser.newContext({ ...scenario, serviceWorkers: "block" });
    // Simulate the display-mode signal used by an installed PWA.
    if (scenario.name.includes("pwa")) await context.addInitScript(() => {
      const match = window.matchMedia.bind(window);
      window.matchMedia = query => query === "(display-mode: standalone)"
        ? { ...match(query), matches: true, addEventListener() {}, removeEventListener() {} }
        : match(query);
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/\/@clerk_react\.js(?:\?|$)/, route =>
      route.fulfill({ contentType: "application/javascript", body: clerkFixture }));
    // Hold each real gate independently, including duplicate legal/billing
    // reads by the guest migration helper.
    let legal = deferred(), billing = deferred(), trial = deferred();
    let started = false;
    const seen = [];
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      seen.push(path);
      let data = {};
      if (path === "/api/legal/acceptance") {
        await legal.promise;
        data = { accepted: true, termsVersion: "fixture", privacyVersion: "fixture" };
      } else if (path === "/api/billing/subscription") {
        await billing.promise;
        data = entitlement(started);
      } else if (path === "/api/billing/start-trial") {
        await trial.promise;
        started = true;
        data = entitlement(true);
      } else if (path === "/api/account/language") data = { language: null };
      else if (path.includes("/market")) data = { market: "PT", source: "manual" };
      else if (path === "/api/receipts") data = { receipts: [], total: 0 };
      else if (path === "/api/receipts/recent") data = [];
      else if (path === "/api/receipts/stats") data = { totalReceipts: 0, totalSpend: 0 };
      else if (path === "/api/mail/pending") data = { items: [], count: 0 };
      await route.fulfill({ json: data });
    });
    const assertBrand = async stage => {
      await expect(page.getByTestId("status-brand-loading")).toBeVisible();
      await expect(page.getByText(scenario.locale === "pt-PT"
        ? "Recibos. Fáceis de encontrar." : "Receipts. Easy to find.", { exact: true })).toBeVisible();
      const geometry = await page.locator(".brand-loading").evaluate(element => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x, y: box.y, width: box.width, height: box.height,
          noScroll: document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
          opacity: getComputedStyle(element.querySelector(".brand-loading__stack")).opacity,
          animation: getComputedStyle(element.querySelector("img")).animationName,
          markLoaded: element.querySelector("img").naturalWidth > 0,
        };
      });
      expect(geometry.noScroll).toBe(true);
      expect(geometry.opacity).toBe("1");
      expect(geometry.markLoaded).toBe(true);
      if (scenario.reducedMotion === "reduce") expect(geometry.animation).toBe("none");
      await page.screenshot({ path: resolve(output, `${scenario.name}-${stage}.png`) });
      return geometry;
    };
    // Real / -> /search redirect, then a direct reload of the protected route.
    await page.goto(origin);
    const first = await assertBrand("auth");
    expect(seen).not.toContain("/api/legal/acceptance");
    await page.evaluate(() => window.finishStartupAuth());
    await expect(page).toHaveURL(`${origin}/search`);
    await assertBrand("legal");
    legal.resolve();
    await assertBrand("plan");
    billing.resolve();
    await expect.poll(() => seen.includes("/api/billing/start-trial")).toBe(true);
    const last = await assertBrand("trial");
    expect([first.x, first.y, first.width, first.height])
      .toEqual([last.x, last.y, last.width, last.height]);
    trial.resolve();
    await expect(page.getByTestId("status-brand-loading")).toHaveCount(0);
    await expect(page.locator("header:visible").first()).toBeVisible();
    expect(errors).toEqual([]);
    // All responses now resolve immediately. Neither the direct route nor a
    // reload adds a minimum duration or changes the navigation destination.
    await page.reload();
    await expect(page.getByTestId("status-brand-loading")).toBeVisible();
    await page.evaluate(() => window.finishStartupAuth());
    await expect(page.getByTestId("status-brand-loading")).toHaveCount(0);
    await expect(page).toHaveURL(`${origin}/search`);
    expect(errors).toEqual([]);
    // Recheck slow startup on a direct protected-route reload, not only /.
    legal = deferred();
    billing = deferred();
    await page.reload();
    await assertBrand("reload-auth");
    await page.evaluate(() => window.finishStartupAuth());
    await assertBrand("reload-legal");
    legal.resolve();
    await assertBrand("reload-plan");
    billing.resolve();
    await expect(page.getByTestId("status-brand-loading")).toHaveCount(0);
    await expect(page).toHaveURL(`${origin}/search`);
    expect(errors).toEqual([]);
    console.log(`${scenario.name}: auth -> legal -> plan -> trial -> app; fast/slow reload; no overflow or browser errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
