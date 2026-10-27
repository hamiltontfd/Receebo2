import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { capturedAt, receipts, isolate } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = path.resolve("generated-artifacts/receebo-marketing");
await mkdir(`${out}/sources`, { recursive: true });
await mkdir(`${out}/web`, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const manifest = { capturedAt, sampleData: true, clips: {}, screens: [], unexpected: [] };
const ff = args => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

try {
  // This document is the fictional input receipt, not a recreation of app UI.
  const input = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1 });
  await input.setContent(`<html><body style="margin:0;padding:65px;background:#fff;font:22px monospace;color:#171717">
    <p style="font-size:15px">FICTIONAL SAMPLE · NOT VALID FOR PURCHASE</p>
    <h1>Casa Lumen Electrónica</h1><p>In-store purchase · Braga, Portugal<br>23 October 2026</p><hr>
    <p>55" 4K Smart TV<br>1 × €649.00</p><hr>
    <h2>Total €649.00</h2><p style="font-size:17px;line-height:1.6">Prices include applicable tax.<br>2-year manufacturer warranty.<br>Terms and exclusions apply.<br>Check with the seller.</p>
    <p style="font-size:16px">Sample data for Receebo demonstration.<br>No payment or account information.</p></body></html>`);
  const receiptImage = `${out}/sources/sample-receipt.png`;
  await input.screenshot({ path: receiptImage });
  await input.close();

  async function context({ width = 1100, height = 850, record = false } = {}) {
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: record ? 1 : 2,
      locale: "en-GB", timezoneId: "Europe/Lisbon", reducedMotion: "reduce",
      serviceWorkers: "block",
      ...(record ? { recordVideo: { dir: `${out}/sources`, size: { width, height } } } : {}),
    });
    const unexpected = await isolate(ctx, receiptImage);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      // The install bar is not part of the marketing story (and the capture
      // harness does not mount it); keep it dismissed in case that changes.
      try { localStorage.setItem("receebo:installBarDismissedAt", String(Date.now())); } catch {}
      // Capture-only emphasis follows actual pointer input; never changes UI.
      addEventListener("DOMContentLoaded", () => {
        const dot = document.createElement("div");
        dot.style.cssText = "pointer-events:none;position:fixed;width:22px;height:22px;border:2px solid #7c3aed;border-radius:50%;background:#8b5cf622;z-index:99999;left:-40px;top:-40px";
        document.body.append(dot);
        addEventListener("pointermove", e => { dot.style.left = `${e.clientX - 11}px`; dot.style.top = `${e.clientY - 11}px`; });
      });
    });
    return { ctx, page, unexpected };
  }
  async function ready(page, route = "/search") {
    await page.goto(`http://127.0.0.1:5199${route}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
  }
  async function still(page, name, locator) {
    const png = `${out}/sources/${name}.png`;
    if (locator) await locator.screenshot({ path: png });
    else await page.screenshot({ path: png });
    ff(["-i", png, "-c:v", "libwebp", "-quality", "88", `${out}/web/${name}.webp`]);
    manifest.screens.push(name);
  }
  async function close(c) {
    manifest.unexpected.push(...c.unexpected);
    await c.ctx.close();
  }
  const desk = await context();
  await ready(desk.page);
  await desk.page.getByRole("button", { name: /Casa Lumen Electrónica.*Oct/ }).waitFor();
  await still(desk.page, "library-desktop");
  await desk.page.getByRole("button", { name: /Casa Lumen Electrónica.*Oct/ }).click();
  await desk.page.getByRole("dialog").waitFor();
  await desk.page.waitForTimeout(500);
  await still(desk.page, "receipt-desktop", desk.page.getByRole("dialog"));
  await desk.page.getByText("Consumer Rights · Portugal", { exact: true }).evaluate(el => el.scrollIntoView({ block: "center" }));
  await desk.page.waitForTimeout(400);
  await still(desk.page, "protection", desk.page.getByText("Consumer Rights · Portugal", { exact: true }).locator(".."));
  await desk.page.getByText("Original Receipt", { exact: true }).scrollIntoViewIfNeeded();
  await still(desk.page, "original-receipt", desk.page.getByText("Original Receipt", { exact: true }).locator(".."));
  await close(desk);

  const phone = await context({ width: 390, height: 844 });
  await ready(phone.page);
  await still(phone.page, "library-phone");
  await phone.page.getByRole("button", { name: /Casa Lumen Electrónica.*Oct/ }).click();
  await phone.page.waitForTimeout(600);
  await still(phone.page, "receipt-phone");
  await close(phone);

  for (const clip of ["capture", "find", "protect"]) {
    const c = await context({ width: 960, height: 640, record: true });
    const video = c.page.video();
    await ready(c.page, clip === "capture" ? "/scan" : "/search");
    const start = Date.now();
    if (clip === "capture") {
      await c.page.mouse.move(450, 375);
      await c.page.waitForTimeout(900);
      await c.page.locator('input[type="file"]').setInputFiles(receiptImage);
      await c.page.getByRole("button", { name: "Save Purchase", exact: true }).waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(900);
      await still(c.page, "capture-poster");
      await c.page.getByRole("button", { name: "Save Purchase", exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(1200);
      await c.page.getByRole("button", { name: "Save Purchase", exact: true }).click();
      await c.page.getByRole("heading", { name: "Casa Lumen Electrónica" }).waitFor();
      await c.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await c.page.waitForTimeout(1800);
    } else {
      const search = c.page.getByPlaceholder(/Search/).first();
      if (clip === "find") {
        await search.click();
        await search.pressSequentially("TV", { delay: 140 });
        await c.page.waitForTimeout(1300);
        await still(c.page, "find-poster");
      }
      await c.page.getByRole("button", { name: /Casa Lumen Electrónica.*Oct/ }).click();
      await c.page.waitForTimeout(1300);
      if (clip === "protect") {
        await c.page.getByText("Consumer Rights · Portugal", { exact: true }).evaluate(el => el.scrollIntoView({ block: "center" }));
        await c.page.waitForTimeout(1200);
        await still(c.page, "protect-poster");
      }
      await c.page.waitForTimeout(2300);
    }
    const duration = (Date.now() - start) / 1000;
    await close(c);
    const source = await video.path();
    const target = `${out}/web/${clip}.mp4`;
    // Strip the initial load, preserve the genuine interaction at real speed.
    ff(["-ss", "1.2", "-i", source, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", target]);
    ff(["-ss", "1.2", "-i", source, "-an", "-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-pix_fmt", "yuv420p", `${out}/web/${clip}.webm`]);
    manifest.clips[clip] = { source: path.basename(source), duration, viewport: "960x640", file: `${clip}.mp4` };
  }
  await writeFile(`${out}/sources/fixtures.json`, JSON.stringify(receipts, null, 2));
  await writeFile(`${out}/manifest.json`, JSON.stringify({ ...manifest, errors }, null, 2));
  if (errors.length || manifest.unexpected.length) throw new Error(JSON.stringify({ errors, unexpected: manifest.unexpected }));
  console.log("Captured real screens and all three interactions.", out);
} finally {
  await browser.close();
}
