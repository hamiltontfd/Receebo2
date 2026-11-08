import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { capturedAt, receipts, isolate, activeCapture } from "./fixtures.mjs";
import { illustrativePdf, sampleDocumentHtml, sampleDocumentLines } from "./sample-document.mjs";

const capture = activeCapture();
const us = capture.name === "us";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = path.resolve(us ? "generated-artifacts/receebo-marketing-us" : "generated-artifacts/receebo-marketing");
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

function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
try {
  // This document is the fictional input receipt, not a recreation of app UI.
  // Its lines are the same words as the fixture, including the illustrative periods.
  const lines = sampleDocumentLines(receipts[0]);
  const receiptImage = `${out}/sources/${us ? "sample-receipt.pdf" : "sample-receipt.png"}`;
  if (us) {
    await writeFile(receiptImage, illustrativePdf(lines));
  } else {
    const input = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
    await input.setContent(sampleDocumentHtml(lines));
    await input.screenshot({ path: receiptImage });
    await input.close();
  }

  async function context({ width = 1100, height = 850, record = false, deviceScaleFactor = record ? 1 : 2 } = {}) {
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor,
      locale: capture.locale, timezoneId: capture.timezoneId, colorScheme: "light", reducedMotion: "reduce",
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
    // US phone frames stay PNG at the requested pixel size. WebP is the EU export step.
    // The disclosure banner is part of the page and is not cropped.
    if (!us) ff(["-i", png, "-c:v", "libwebp", "-quality", "88", `${out}/web/${name}.webp`]);
    manifest.screens.push(name);
  }
  const heroButton = page => page.getByRole("button", { name: new RegExp(receipts[0].merchant) }).first();
  const layout = {};
  async function measure(page, name) {
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const boxes = {};
    for (const id of ["section-highlights", "section-return-by", "section-warranty", "section-complete-list", "button-view-original", "button-more-actions"]) {
      const locator = page.getByTestId(id);
      if (await locator.count() === 0) continue;
      const box = await locator.boundingBox();
      if (!box) continue;
      const centerY = box.y + box.height / 2;
      boxes[id] = {
        x: box.x, y: box.y, width: box.width, height: box.height, centerY, dpr,
        centerYAtDpr3: centerY * 3,
      };
    }
    layout[name] = { dpr, boxes };
  }
  async function requireVisible(page, locator, label, seen = []) {
    try {
      await locator.waitFor({ timeout: 30000 });
    } catch (error) {
      const body = await page.locator("body").innerText().catch(() => "");
      const buttons = await page.getByRole("button").evaluateAll(els => els.map(el => el.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40)).catch(() => []);
      await page.screenshot({ path: `${out}/sources/failure.png` }).catch(() => {});
      await writeFile(`${out}/sources/failure.json`, JSON.stringify({
        label, message: String(error), pageErrors: errors, unexpected: seen, body: body.slice(0, 4000), buttons,
      }, null, 2));
      throw error;
    }
  }
  async function close(c) {
    manifest.unexpected.push(...c.unexpected);
    await c.ctx.close();
  }
  if (!us || process.env.CAPTURE_DESKTOP === "1") {
    const desk = await context(us ? { width: 1440, height: 900, deviceScaleFactor: 2 } : {});
    await ready(desk.page);
    await requireVisible(desk.page, heroButton(desk.page), "desktop library", desk.unexpected);
    await still(desk.page, "library-desktop");
    await heroButton(desk.page).click();
    await requireVisible(desk.page, desk.page.getByRole("dialog"), "desktop receipt", desk.unexpected);
    await desk.page.waitForTimeout(500);
    await still(desk.page, "receipt-desktop", desk.page.getByRole("dialog"));
    await measure(desk.page, "receipt-desktop");
    if (!us) {
      await desk.page.getByTestId("section-warranty").evaluate(el => el.scrollIntoView({ block: "center" }));
      await desk.page.waitForTimeout(400);
      await still(desk.page, "protection", desk.page.getByTestId("section-warranty"));
    }
    await close(desk);
  }

  const phone = await context({ ...capture.phone });
  await ready(phone.page);
  await requireVisible(phone.page, heroButton(phone.page), "phone library", phone.unexpected);
  await still(phone.page, "library-phone");
  await heroButton(phone.page).click();
  await requireVisible(phone.page, phone.page.getByRole("dialog"), "phone receipt", phone.unexpected);
  await phone.page.waitForTimeout(600);
  await still(phone.page, "receipt-phone");
  await measure(phone.page, "receipt-phone");
  if (us) {
    await phone.page.getByTestId("button-more-actions").scrollIntoViewIfNeeded();
    await phone.page.waitForTimeout(300);
    await still(phone.page, "receipt-actions");
    await measure(phone.page, "receipt-actions");
    await phone.page.goto("http://127.0.0.1:5199/scan");
    await phone.page.waitForTimeout(800);
    await still(phone.page, "scan-upload");
    await phone.page.locator('input[type="file"]').setInputFiles(receiptImage);
    await phone.page.getByRole("button", { name: "Save Purchase", exact: true }).waitFor({ timeout: 20000 });
    await requireVisible(phone.page, phone.page.getByTestId("section-warranty"), "scan review", phone.unexpected);
    await phone.page.getByTestId("section-warranty").scrollIntoViewIfNeeded();
    await phone.page.waitForTimeout(400);
    await still(phone.page, "scan-review");
    await measure(phone.page, "scan-review");
    for (const name of ["library-phone", "receipt-phone", "receipt-actions", "scan-upload", "scan-review"]) {
      const size = pngSize(await readFile(`${out}/sources/${name}.png`));
      if (size.width !== 1170 || size.height !== 2532) {
        throw new Error(`${name}.png is ${size.width}x${size.height}; expected 1170x2532`);
      }
    }
  } else {
    // EU landing slot. The disclosure stays in the captured page; the landing
    // frame crops it later. Do not apply that crop inside this harness.
    await phone.page.setViewportSize({ width: 390, height: 640 });
    const storeButton = phone.page.getByRole("button", { name: "View original receipt", exact: true });
    await storeButton.scrollIntoViewIfNeeded();
    await storeButton.click();
    const storeImage = phone.page.locator('[aria-label="Dismiss full-screen receipt view"] img');
    await storeImage.waitFor();
    await storeImage.evaluate(img => img.decode());
    await phone.page.mouse.move(340, 600);
    await phone.page.waitForTimeout(600);
    await still(phone.page, "show-to-store");
  }
  await close(phone);

  if (us && process.env.CAPTURE_CLIPS !== "1") {
    console.log("US stills only. Published video files were not encoded or replaced.", out);
  } else for (const clip of ["capture", "find", "protect"]) {
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
      await c.page.getByRole("heading", { name: receipts[0].merchant }).waitFor();
      await c.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await c.page.waitForTimeout(1800);
    } else {
      const search = c.page.getByPlaceholder(/Search/).first();
      if (clip === "find") {
        await search.click();
        await search.pressSequentially(capture.searchQuery, { delay: 140 });
        await c.page.waitForTimeout(1300);
        await still(c.page, "find-poster");
      }
      await heroButton(c.page).click();
      await c.page.waitForTimeout(1300);
      if (clip === "protect") {
        await c.page.getByTestId("section-warranty").evaluate(el => el.scrollIntoView({ block: "center" }));
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
  await writeFile(`${out}/sources/layout.json`, JSON.stringify({ capturedAt, context: capture.name, dprNote: "centerYAtDpr3 is the viewport center Y in CSS pixels times 3", layout }, null, 2));
  await writeFile(`${out}/manifest.json`, JSON.stringify({ ...manifest, layout, errors }, null, 2));
  if (errors.length || manifest.unexpected.length) throw new Error(JSON.stringify({ errors, unexpected: manifest.unexpected }));
  console.log(us && process.env.CAPTURE_CLIPS !== "1"
    ? `Captured US stills only. No video was encoded. ${out}`
    : `Captured real screens and all three interactions. ${out}`);
} finally {
  await browser.close();
}
