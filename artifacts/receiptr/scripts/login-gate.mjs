// Signed-out checks only. Never submits credentials, starts trials, or publishes.
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { iconBrowserOptions } from "./icon-browser.mjs";

const demo = process.env.LOGIN_GATE_FAIL_DEMO === "1" || process.argv.includes("--fail-demo");
const timeout = 30_000;
const output = resolve(import.meta.dirname, "../../../generated-artifacts/login-gate", demo ? "fail-demo" : ".");
let demoServer;
let browser;

function targetOrigin(value) {
  if (!value) throw new Error("Set REPLIT_DEV_DOMAIN or LOGIN_GATE_ORIGIN to the DEV preview.");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LOGIN_GATE_ORIGIN must be an HTTP(S) origin without credentials, path, or query.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if ((host === "receebo.net" || host === "www.receebo.net" || host.endsWith(".replit.app")) &&
      process.env.LOGIN_GATE_ALLOW_PROD !== "1") {
    throw new Error("Production target refused. This gate must run on the DEV candidate.");
  }
  return url.origin;
}

function clerkRequest(url) {
  return url.pathname.startsWith("/api/__clerk/") ||
    url.pathname.includes("/npm/@clerk/") ||
    /(^|\.)clerk\.(dev|com|accounts)$/.test(url.hostname) ||
    /(^|\.)clerk\.accounts\.dev$/.test(url.hostname);
}

async function formVisible(page) {
  // Clerk can render in the top document or an iframe; titles need not be visible.
  for (const frame of page.frames()) {
    try {
      const fields = frame.locator('input[type="email"], input[name="identifier"], input[autocomplete="email"]');
      for (const field of await fields.all()) if (await field.isVisible()) return true;
      const google = frame.getByRole("button", { name: /(?:continue|sign in|sign up).*google/i });
      for (const button of await google.all()) if (await button.isVisible()) return true;
    } catch {
      // A frame may detach while Clerk mounts. Retry within the bounded poll.
    }
  }
  return false;
}

async function checkViewport(origin, scenario) {
  const context = await browser.newContext({
    viewport: scenario.viewport, locale: "en-US", serviceWorkers: "block",
    ...(scenario.name === "mobile" ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const failures = new Set();
  const required = new Set();
  const inFlight = new Set();
  let proxyUsed = false;
  let uiPassed = false;
  const fail = message => failures.add(message);
  const inspect = request => {
    const url = new URL(request.url());
    if (!clerkRequest(url)) return false;
    proxyUsed ||= url.pathname.startsWith("/api/__clerk/");
    const pkg = url.pathname.match(/\/npm\/@clerk\/(clerk-js|ui)@([^/]+)/);
    if (pkg && !/^\d+\.\d+\.\d+$/.test(pkg[2])) fail(`Non-exact Clerk version: ${url.pathname}`);
    return true;
  };
  context.on("request", request => {
    if (inspect(request)) inFlight.add(request);
  });
  context.on("requestfailed", request => {
    if (inspect(request)) fail(`Clerk request failed: ${new URL(request.url()).pathname}`);
    inFlight.delete(request);
  });
  context.on("response", response => {
    const request = response.request();
    if (!inspect(request)) return;
    const path = new URL(response.url()).pathname;
    const status = response.status();
    console.log(`[${scenario.name}] ${status} ${path}`); // No query strings or headers.
    const successful = status >= 200 && status < 300;
    const relevant = path.startsWith("/api/__clerk/") || path.includes("/npm/@clerk/") ||
      /\/v1\/(?:environment|client)\/?$/.test(path);
    if (status >= 500 || (relevant && !successful)) fail(`Clerk HTTP ${status}: ${path}`);
    if (successful) {
      if (/\/clerk\.browser\.js$/.test(path)) required.add("clerk.browser.js");
      if (/\/ui\.browser\.js$/.test(path)) required.add("ui.browser.js");
      if (/\/v1\/environment\/?$/.test(path)) required.add("/v1/environment");
      if (/\/v1\/client\/?$/.test(path)) required.add("/v1/client");
    }
  });
  context.on("requestfinished", request => inFlight.delete(request));
  // Block application writes, including analytics. Leave Clerk's own protocol intact.
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (process.env.LOGIN_GATE_ALLOW_PROD !== "1" &&
        (host === "receebo.net" || host === "www.receebo.net") &&
        ["document", "script", "xhr", "fetch"].includes(request.resourceType())) {
      fail(`Production request refused: ${url.pathname}`);
      return route.abort();
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        !clerkRequest(url)) {
      console.log(`[${scenario.name}] Blocked non-Clerk write: ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  try {
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout });
    await expect(page.locator(".brand-loading")).toBeHidden({ timeout });
    await expect(page.getByTestId("link-hero-trial")).toBeVisible({ timeout });
    await expect(page.locator("header img[alt='Receebo']")).toBeVisible({ timeout });
    await page.screenshot({ path: resolve(output, `${scenario.name}-home.png`) });
    await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded", timeout });
    await expect.poll(async () => {
      for (const dialog of await page.getByRole("dialog").all()) {
        if (await dialog.isVisible() &&
            /Sign in to Receebo/i.test(await dialog.textContent())) return true;
      }
      return false;
    }, { timeout, message: "Receebo sign-in dialog must appear" }).toBe(true);
    await expect.poll(() => formVisible(page), {
      timeout, message: "Clerk must show an email field or Google control",
    }).toBe(true);
    await expect.poll(() => required.size, {
      timeout, message: "Both Clerk bundles and environment/client must return 2xx",
    }).toBe(4);
    await expect.poll(() => inFlight.size, {
      timeout, message: "Requested Clerk assets must finish",
    }).toBe(0);
    uiPassed = true;
  } catch {
    // Do not print Playwright exceptions: they can contain token-bearing URLs.
    fail("Landing/login did not satisfy the UI/network checks within the timeout.");
  } finally {
    await page.screenshot({ path: resolve(output, `${scenario.name}-${uiPassed ? "sign-in" : "failed"}.png`) })
      .catch(() => fail("Could not save diagnostic screenshot."));
    await context.close();
  }
  for (const name of ["clerk.browser.js", "ui.browser.js", "/v1/environment", "/v1/client"]) {
    if (!required.has(name)) fail(`Missing successful response: ${name}`);
  }
  if (!proxyUsed) console.log(`[${scenario.name}] DEV uses direct Clerk; production proxy path is covered by the isolated unit tests.`);
  for (const failure of failures) console.error(`[${scenario.name}] FAIL: ${failure}`);
  console.log(`[${scenario.name}] ${failures.size ? "FAIL" : "PASS"}`);
  return failures.size === 0;
}

try {
  let origin;
  if (demo) {
    demoServer = createServer((req, res) => {
      if (req.url.startsWith("/api/__clerk/")) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        return res.end("Simulated Clerk failure");
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><html><body><div class="brand-loading">Receebo Loading…</div>
        <script src="/api/__clerk/npm/@clerk/ui@1/dist/ui.browser.js"></script>
        <script>fetch('/api/__clerk/v1/environment');fetch('/api/__clerk/v1/client');</script>
        </body></html>`);
    });
    await new Promise(resolve => demoServer.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${demoServer.address().port}`;
    console.log("FAIL-DEMO: temporary local fixture; a non-zero exit is expected.");
  } else {
    origin = targetOrigin(process.env.LOGIN_GATE_ORIGIN ||
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""));
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({
    ...iconBrowserOptions(process.env.CHROMIUM_PATH || process.env.PWA_CHROMIUM_PATH),
    args: ["--no-sandbox"],
  });
  let passed = true;
  for (const scenario of [
    { name: "desktop", viewport: { width: 1280, height: 800 } },
    { name: "mobile", viewport: { width: 390, height: 844 } },
  ]) passed = await checkViewport(origin, scenario) && passed;
  if (!passed) process.exitCode = 1;
  console.log(passed ? "LOGIN GATE PASSED (DEV only; not permission to publish)." :
    "LOGIN GATE FAILED — do not publish.");
} catch {
  // Avoid accidentally printing secret-bearing URLs from browser/runtime errors.
  console.error("LOGIN GATE FAILED — check target origin, Chromium availability, and saved screenshots. Do not publish.");
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (demoServer) await new Promise(resolve => demoServer.close(resolve));
}
