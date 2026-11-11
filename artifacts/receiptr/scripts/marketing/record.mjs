import { mkdir, writeFile, readFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { capturedAt, receipts, isolate, activeCapture } from "./fixtures.mjs";
import { sampleDocumentHtml, sampleDocumentLines } from "./sample-document.mjs";
import { captureLocators } from "./locators.mjs";

/** All contexts record clips by default. Explicit 0 is useful for still-only review. */
export function clipsEnabled(_usContext, flag = process.env.CAPTURE_CLIPS) {
  return flag !== "0";
}

/** No filter preserves the full capture. Unknown names fail before writing files. */
export function capturePlan(only = process.env.CAPTURE_ONLY, clipFlag = process.env.CAPTURE_CLIPS) {
  const selected = only?.trim() ? [...new Set(only.split(",").map(name => name.trim()))] : null;
  if (selected?.some(name => !["review", "capture"].includes(name))) {
    throw new Error("CAPTURE_ONLY accepts review,capture (or either name alone)");
  }
  if (selected?.includes("capture") && !clipsEnabled(false, clipFlag)) {
    throw new Error("CAPTURE_ONLY=capture requires clips; remove CAPTURE_CLIPS=0");
  }
  return {
    partial: selected !== null,
    review: selected === null || selected.includes("review"),
    clips: clipsEnabled(false, clipFlag)
      ? ["capture", "find", "protect"].filter(name => selected === null || selected.includes(name))
      : [],
  };
}

export const reviewHoldMs = 3000;

export const captureSizes = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
  clip: { width: 960, height: 640, deviceScaleFactor: 1 },
};
export const heroScenes = {
  home: "library-phone", upload: "scan-upload", review: "scan-review",
  detail: "receipt-returns", warranty: "receipt-warranty", "home-desktop": "library-desktop",
};

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
const capture = activeCapture();
const plan = capturePlan();

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = path.resolve(capture.output);
await mkdir(`${out}/sources`, { recursive: true });
await mkdir(`${out}/web`, { recursive: true });
const processLocale = `${capture.locale.replace("-", "_")}.UTF-8`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", `--lang=${capture.locale}`],
  env: { ...process.env, LANG: processLocale, LC_ALL: processLocale, LANGUAGE: capture.locale.replace("-", "_") },
});
const errors = [];
const manifest = { capturedAt, context: capture.name, market: capture.market, language: capture.language, sampleData: true, partial: plan.partial, reviewTotals: {}, clips: {}, screens: [], unexpected: [] };
const ff = args => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
let inputDirectory;

function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
try {
  // This document is the fictional input receipt, not a recreation of app UI.
  // Its lines are the same words as the fixture, including the illustrative periods.
  const lines = sampleDocumentLines(receipts[0], capture.language);
  // Image originals exercise the app's real fullscreen Show-to-store in every
  // market. PDF originals open a separate browser tab, not that app view.
  // Partial runs must not overwrite the input/source assets of a previous full run.
  inputDirectory = plan.partial ? await mkdtemp(path.join(tmpdir(), "receebo-review-input-")) : null;
  const receiptImage = `${inputDirectory ?? `${out}/sources`}/sample-receipt.png`;
  const input = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
  await input.setContent(sampleDocumentHtml(lines, capture.language));
  await input.screenshot({ path: receiptImage });
  await input.close();

  async function context({ width = 1440, height = 900, record = false, deviceScaleFactor = record ? 1 : 2 } = {}) {
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor,
      locale: capture.locale, timezoneId: capture.timezoneId, colorScheme: "light", reducedMotion: "reduce",
      serviceWorkers: "block",
      ...(record ? { recordVideo: { dir: `${out}/sources`, size: { width, height } } } : {}),
    });
    const unexpected = await isolate(ctx, receiptImage);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(showPointer => {
      // The install bar is not part of the marketing story (and the capture
      // harness does not mount it); keep it dismissed in case that changes.
      try { localStorage.setItem("receebo:installBarDismissedAt", String(Date.now())); } catch {}
      // The ring is only for clip recordings. Still frames never draw it.
      if (!showPointer) return;
      addEventListener("DOMContentLoaded", () => {
        const dot = document.createElement("div");
        dot.setAttribute("data-capture-pointer", "");
        dot.style.cssText = "pointer-events:none;position:fixed;width:22px;height:22px;border:2px solid #7c3aed;border-radius:50%;background:#8b5cf622;z-index:99999;left:-40px;top:-40px";
        document.body.append(dot);
        addEventListener("pointermove", e => { dot.style.left = `${e.clientX - 11}px`; dot.style.top = `${e.clientY - 11}px`; });
      });
    }, record);
    return { ctx, page, unexpected };
  }
  async function ready(page, route = "/search") {
    await page.goto(`http://127.0.0.1:5199${route}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
  }
  async function still(page, name, locator) {
    const png = `${out}/sources/${name}.png`;
    // Hide the clip pointer for the still itself, then restore it for the recording.
    await page.evaluate(() => {
      const dot = document.querySelector("[data-capture-pointer]");
      if (dot) dot.style.visibility = "hidden";
    }).catch(() => {});
    try {
      if (locator) await locator.screenshot({ path: png });
      else await page.screenshot({ path: png });
    } finally {
      await page.evaluate(() => {
        const dot = document.querySelector("[data-capture-pointer]");
        if (dot) dot.style.visibility = "";
      }).catch(() => {});
    }
    // Keep source PNGs and export WebP in every market. Never crop the disclosure.
    ff(["-i", png, "-c:v", "libwebp", "-quality", "88", `${out}/web/${name}.webp`]);
    manifest.screens.push(name);
  }
  async function alias(name, source) {
    await copyFile(`${out}/sources/${source}.png`, `${out}/sources/${name}.png`);
    await copyFile(`${out}/web/${source}.webp`, `${out}/web/${name}.webp`);
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
        centerYAtDpr3: centerY * 3, centerYInPixels: centerY * dpr,
      };
    }
    const frame = await page.evaluate(() => {
      const fully = (el, limit) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const box = limit ?? { top: 0, bottom: window.innerHeight };
        return {
          x: r.x, y: r.y, width: r.width, height: r.height,
          top: r.top, bottom: r.bottom,
          fullyVisible: r.height > 0 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.bottom <= window.innerHeight + 0.5,
        };
      };
      const section = document.querySelector('[data-testid="section-warranty"]');
      let scroller = section?.parentElement ?? null;
      while (scroller && scroller !== document.body) {
        const style = getComputedStyle(scroller);
        if (/(auto|scroll)/.test(style.overflowY)) break;
        scroller = scroller.parentElement;
      }
      const limit = scroller && scroller !== document.body ? scroller.getBoundingClientRect() : null;
      const disclosure = document.querySelector("[data-capture-disclosure]");
      const cards = [...document.querySelectorAll('[data-testid="row-warranty"]')]
        .filter(el => /year|month|ano|meses|mês/i.test(el.textContent))
        .map(el => ({ text: el.innerText.replace(/\s+/g, " ").trim(), ...fully(el, limit) }));
      return { disclosure: fully(disclosure), manufacturerCards: cards };
    });
    const mark = (box) => {
      if (!box) return box;
      const centerY = box.top + box.height / 2;
      return { ...box, centerY, centerYAtDpr3: centerY * 3 };
    };
    layout[name] = {
      dpr, boxes,
      disclosure: mark(frame.disclosure),
      manufacturerCards: frame.manufacturerCards.map(mark),
    };
  }
  async function showWarrantyTerms(page) {
    await page.getByTestId("section-warranty").evaluate(section => {
      let scroller = section.parentElement;
      while (scroller && scroller !== document.body) {
        const style = getComputedStyle(scroller);
        if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 1) break;
        scroller = scroller.parentElement;
      }
      if (!scroller || scroller === document.body) return;
      scroller.scrollTop += section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    });
    await page.waitForTimeout(300);
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
  async function reviewTotal(c) {
    const prefix = c.page.getByTestId("text-total-currency");
    await requireVisible(c.page, prefix, "scan review TOTAL", c.unexpected);
    await prefix.scrollIntoViewIfNeeded();
    return prefix.evaluate(el => {
      const input = el.parentElement.querySelector("input");
      const box = el.parentElement.getBoundingClientRect();
      if (!input || box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) {
        throw new Error("Review TOTAL must be fully visible before capture");
      }
      return { prefix: el.textContent.trim(), value: input.value, type: input.type, inputMode: input.inputMode };
    });
  }
  if (!plan.partial) {
    const desk = await context(captureSizes.desktop);
    await ready(desk.page);
    await requireVisible(desk.page, heroButton(desk.page), "desktop library", desk.unexpected);
    await still(desk.page, "library-desktop");
    await heroButton(desk.page).click();
    await requireVisible(desk.page, desk.page.getByRole("dialog"), "desktop receipt", desk.unexpected);
    await desk.page.waitForTimeout(500);
    await still(desk.page, "receipt-desktop", desk.page.getByRole("dialog"));
    await measure(desk.page, "receipt-desktop");
    await desk.page.getByTestId("section-warranty").waitFor();
    await desk.page.waitForTimeout(400);
    // Capture today's per-item UI, including return and warranty terms; never
    // substitute an old Consumer rights card or hand-authored legal wording.
    await still(desk.page, "protection", desk.page.getByTestId("item-coverage"));
    await close(desk);
  }

  if (plan.review) {
  const phone = await context(captureSizes.phone);
  const phoneUi = captureLocators(phone.page, capture.language);
  if (!plan.partial) {
  await ready(phone.page);
  await requireVisible(phone.page, heroButton(phone.page), "phone library", phone.unexpected);
  await still(phone.page, "library-phone");
  await heroButton(phone.page).click();
  await requireVisible(phone.page, phone.page.getByRole("dialog"), "phone receipt", phone.unexpected);
  await phone.page.waitForTimeout(600);
  await still(phone.page, "receipt-phone");
  await measure(phone.page, "receipt-phone");
  await phone.page.getByTestId("section-return-by").scrollIntoViewIfNeeded();
  await phone.page.waitForTimeout(300);
  await still(phone.page, "receipt-returns");
  await showWarrantyTerms(phone.page);
  await still(phone.page, "receipt-warranty");
  await measure(phone.page, "receipt-warranty");
  await phoneUi.original.scrollIntoViewIfNeeded();
  await phoneUi.original.click();
  await requireVisible(phone.page, phoneUi.originalImage, "show-to-store image", phone.unexpected);
  await phoneUi.originalImage.evaluate(img => img.decode());
  await phone.page.waitForTimeout(600);
  await still(phone.page, "show-to-store");
  }

  await ready(phone.page, "/scan");
  if (!plan.partial) await still(phone.page, "scan-upload");
  await phone.page.locator('input[type="file"]').setInputFiles(receiptImage);
  await phoneUi.save.waitFor({ timeout: 20000 });
  await requireVisible(phone.page, phone.page.getByTestId("item-coverage"), "scan review", phone.unexpected);
  manifest.reviewTotals.review = await reviewTotal(phone);
  await phone.page.waitForTimeout(400);
  await still(phone.page, "scan-review-form");
  await phoneUi.save.scrollIntoViewIfNeeded();
  await phoneUi.save.click();
  await phone.page.waitForURL(`**/receipts/${receipts[0].id}`);
  const savedHeading = phone.page.getByRole("heading", { name: receipts[0].merchant, exact: true });
  await requireVisible(phone.page, savedHeading, "saved receipt confirmation", phone.unexpected);
  await phone.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  // Let the real page transition settle; never replace the product card with a mock.
  await phone.page.waitForTimeout(600);
  const savedHero = phone.page.locator(".rounded-2xl.bg-foreground.text-background").filter({ has: savedHeading });
  await requireVisible(phone.page, savedHero, "saved receipt hero card", phone.unexpected);
  const heroVisible = await savedHero.evaluate(card => {
    const box = card.getBoundingClientRect();
    const total = card.querySelector("p.font-mono");
    return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth
      && Boolean(total?.textContent?.trim()) && total.textContent.trim() !== "--";
  });
  if (!heroVisible) throw new Error("Saved receipt hero with merchant and total must be fully visible before capture");
  await still(phone.page, "scan-review");
  await measure(phone.page, "scan-review");
  for (const [name, source] of Object.entries(heroScenes)) {
    if (plan.partial && name !== "review") continue;
    await alias(name, source);
    const size = pngSize(await readFile(`${out}/sources/${name}.png`));
    const expected = name === "home-desktop" ? [2880, 1800] : [780, 1688];
    if (size.width !== expected[0] || size.height !== expected[1]) {
      throw new Error(`${name}.png is ${size.width}x${size.height}; expected ${expected.join("x")}`);
    }
  }
  await close(phone);
  }

  for (const clip of plan.clips) {
    const c = await context({ ...captureSizes.clip, record: true });
    const ui = captureLocators(c.page, capture.language);
    const video = c.page.video();
    await ready(c.page, clip === "capture" ? "/scan" : "/search");
    const start = Date.now();
    if (clip === "capture") {
      await c.page.mouse.move(450, 375);
      await c.page.waitForTimeout(900);
      await c.page.locator('input[type="file"]').setInputFiles(receiptImage);
      await ui.save.waitFor({ timeout: 20000 });
      manifest.reviewTotals.capture = await reviewTotal(c);
      await c.page.waitForTimeout(reviewHoldMs);
      await still(c.page, "capture-poster");
      await ui.save.scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(1200);
      await ui.save.click();
      await c.page.getByRole("heading", { name: receipts[0].merchant }).waitFor();
      await c.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await c.page.waitForTimeout(1800);
    } else {
      const search = ui.search;
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
    manifest.clips[clip] = { source: path.basename(source), duration, viewport: "960x640", file: `${clip}.mp4`,
      ...(clip === "capture" ? { reviewHoldMs } : {}) };
  }
  if (!plan.partial) await writeFile(`${out}/sources/fixtures.json`, JSON.stringify(receipts, null, 2));
  await writeFile(`${out}/sources/layout${plan.partial ? ".partial" : ""}.json`, JSON.stringify({ capturedAt, context: capture.name, dprNote: "centerYInPixels uses the actual DPR; centerYAtDpr3 is retained only for older analysis tools", layout }, null, 2));
  // Never pass off a partial recapture as fresh evidence for all the other scenes.
  await writeFile(`${out}/manifest${plan.partial ? ".partial" : ""}.json`, JSON.stringify({ ...manifest, layout, errors }, null, 2));
  if (errors.length || manifest.unexpected.length) throw new Error(JSON.stringify({ errors, unexpected: manifest.unexpected }));
  console.log(`Captured ${plan.partial ? "partial" : "full"} ${capture.name}: ${manifest.screens.join(", ")}; clips: ${plan.clips.join(", ") || "none"}. ${out}`);
} finally {
  await browser.close();
  if (inputDirectory) await rm(inputDirectory, { recursive: true, force: true });
}
}
