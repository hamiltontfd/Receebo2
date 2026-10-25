import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "generated-artifacts/receebo-marketing/verification";
await mkdir(out, { recursive: true });
// Real landing page, normal auth intact, no interception or fixture harness.
const url = process.env.LANDING_URL || `https://${process.env.REPLIT_DEV_DOMAIN}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
const report = [];
try {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    console.log(`Checking landing page at ${width}px`);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    console.log("Landing page loaded");
    await page.getByRole("heading", { name: "Receipts. Easy to find." }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Horizontal overflow");
    await page.screenshot({ path: `${out}/hero-${width}.png` });
    await page.locator("#demo").scrollIntoViewIfNeeded();
    const videos = page.locator("video");
    assert.equal(await videos.count(), 3);
    const clips = [];
    for (const video of await videos.all()) {
      console.log("Checking video", await video.getAttribute("aria-label"));
      await video.scrollIntoViewIfNeeded();
      const properties = await video.evaluate(v => ({
        autoplay: v.autoplay, controls: v.controls, preload: v.preload, paused: v.paused, poster: v.poster,
      }));
      assert.deepEqual([properties.autoplay, properties.controls, properties.preload, properties.paused], [false, true, "none", true]);
      assert((await page.request.get(properties.poster)).ok(), "Poster must load");
      await video.evaluate(async v => {
        v.muted = true;
        await Promise.race([
          v.play(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Video playback timed out: ${v.currentSrc}`)), 15000)),
        ]);
      });
      await page.waitForTimeout(900);
      const playback = await video.evaluate(v => {
        const result = { time: v.currentTime, width: v.videoWidth, height: v.videoHeight, duration: v.duration, error: v.error?.message };
        v.pause();
        return result;
      });
      assert(playback.time > 0 && playback.width === 960 && !playback.error, JSON.stringify(playback));
      await video.evaluate(v => { v.currentTime = Math.max(0, v.duration - 1); });
      await page.waitForTimeout(300);
      assert(await video.evaluate(v => v.currentTime >= v.duration - 1.1), "Video seek failed");
      clips.push(playback);
    }
    await page.locator("#demo").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/demos-${width}.png` });
    const featureTabs = page.getByRole("button", { name: /^(Capture|Find|Protect|Prove)$/ });
    for (const tab of await featureTabs.all()) {
      await tab.click();
      await page.waitForTimeout(800);
      const active = page.locator("figure").filter({ has: page.locator('img[loading="lazy"]') });
      for (const img of await active.locator("img").all()) {
        await img.scrollIntoViewIfNeeded();
        await img.evaluate(async i => { await i.decode(); });
        assert(await img.evaluate(i => i.naturalWidth > 0));
      }
    }
    assert.equal(errors.length, 0, errors.join("\n"));
    report.push({ width, clips, errors, reducedMotion: true, horizontalOverflow: false });
    await ctx.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
