// Run after the production build, with the artifact's development workflow
// stopped. Uses its existing proxy/port, never production or payment services.
import { createServer } from "node:http";
import { readFile, stat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { chromium, expect } from "@playwright/test";

const root = resolve(import.meta.dirname, "../dist/public");
const output = resolve(import.meta.dirname, "../../../generated-artifacts/pwa");
const origin = process.env.PWA_TEST_ORIGIN || "http://localhost";
const port = Number(process.env.PORT || 5000);
let revision = 1;
const manifest = JSON.parse(await readFile(resolve(root, "manifest.webmanifest"), "utf8"));
expect(manifest.start_url).toBe("/");
expect(manifest.scope).toBe("/");
expect(manifest.id).toBe("/");
expect(manifest.display).toBe("standalone");
for (const icon of manifest.icons) {
  const png = await readFile(resolve(root, icon.src.replace(/^\//, "")));
  const size = icon.sizes.split("x").map(Number);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(size);
}
expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
const html = await readFile(resolve(root, "index.html"), "utf8");
expect(html).toContain("manifest.webmanifest");
expect(html).not.toContain("maximum-scale");
const types = { ".js": "application/javascript", ".html": "text/html", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, origin).pathname);
    let file = resolve(root, `.${path}`);
    if (!file.startsWith(`${root}/`) && file !== root) { res.writeHead(403).end(); return; }
    try { if (!(await stat(file)).isFile()) file = resolve(root, "index.html"); }
    catch { file = resolve(root, "index.html"); }
    let body = await readFile(file);
    if (path === "/sw.js") body = Buffer.concat([body, Buffer.from(`\n// browser-check revision ${revision}\n`)]);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch { res.writeHead(500).end(); }
});
await new Promise((done) => server.listen(port, "0.0.0.0", done));
let context;
const profile = await mkdtemp(resolve(tmpdir(), "receebo-pwa-"));
try {
  await mkdir(output, { recursive: true });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.PWA_CHROMIUM_PATH ? { executablePath: process.env.PWA_CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(`${origin}/privacy`);
  await expect(page.getByRole("heading", { name: /privacy policy/i }).first()).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(output, "online-mobile.png"), fullPage: false });
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  console.log("Chromium installability:", JSON.stringify(installability));
  expect(installability.installabilityErrors).toEqual([]);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat();
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(cached.some((url) => /\/api\/|\/__clerk\/|checkout\.stripe/.test(url))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Receebo is offline" })).toBeVisible();
  await expect(page.getByText(/Nothing is queued or saved offline/)).toBeVisible();
  await page.screenshot({ path: resolve(output, "offline-mobile.png") });
  // Root must not be swallowed by Workbox's precache directoryIndex route.
  for (const path of ["/", "/scan", "/receipts/42", "/privacy"]) {
    await page.goto(`${origin}${path}`);
    await expect(page.getByRole("heading", { name: "Receebo is offline" })).toBeVisible();
  }
  for (const path of ["/api/storage/objects/not-a-file", "/api/billing/subscription", "/api/gmail/callback", "/__clerk/v1/client", "/sign-in/sso-callback"]) {
    const result = await page.evaluate(async (path) => {
      // A real navigation request is tested in a separate window below too.
      try { return await (await fetch(path)).text(); } catch { return "NETWORK_FAILURE"; }
    }, path);
    expect(result).toBe("NETWORK_FAILURE");
  }
  const offlineApi = await context.newPage();
  await expect(offlineApi.goto(`${origin}/api/storage/objects/not-a-file`)).rejects.toThrow(/net::ERR_/);
  await offlineApi.close();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: /privacy policy/i }).first()).toBeVisible();
  // Simulate a new deployment by changing only the served worker bytes.
  revision++;
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await expect(page.getByRole("button", { name: "Update now" })).toBeVisible({ timeout: 15000 });
  const second = await context.newPage();
  await second.goto(`${origin}/terms`);
  await expect(second.getByRole("heading", { name: /terms of service/i }).first()).toBeVisible();
  await page.getByRole("button", { name: "Update now" }).click();
  await expect(page.getByText(/Close other Receebo tabs or windows, then try again/)).toBeVisible();
  expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))).toBe(true);
  await second.close();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Update now" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: /privacy policy/i }).first()).toBeVisible();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting === null)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${origin}/`);
  await expect(page.getByRole("heading").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  console.log("PASS: manifest/icons, installability, scoped private-path exclusions, offline reload/reconnect, multi-window refusal and explicit update/reload, mobile/desktop public-page overflow.");
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
  await new Promise((done) => server.close(done));
}
