import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { verifyRanges } from "./verify-ranges.mjs";

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = resolve(import.meta.dirname, "../../../../generated-artifacts/receebo-marketing/verification");
await mkdir(out, { recursive: true });
const url = process.env.LANDING_URL || `https://${process.env.REPLIT_DEV_DOMAIN}/`;
const target = new URL(url);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.hostname.endsWith(".replit.dev"),
  "LANDING_URL must be a local or .replit.dev preview, not production",
);
const engines = (process.env.MARKETING_ENGINES || "chromium,firefox,webkit").split(",");
assert(engines.every(name => ["chromium", "firefox", "webkit"].includes(name)), "Unknown MARKETING_ENGINES value");
const fullMatrixRequested = engines.length === 3 && new Set(engines).size === 3;
const report = { url, engines, fullMatrixRequested, checks: [], limitations: [] };
let failures = 0;

// Save after every check, including failed launches, so CI always has evidence.
async function check(name, details, run) {
  try {
    const result = await run();
    report.checks.push({ name, ...details, status: "passed", result: name === "launch" ? { version: result.version() } : result });
    console.log(`PASS ${name} ${JSON.stringify(details)}`);
    return result;
  } catch (error) {
    failures++;
    report.checks.push({ name, ...details, status: "failed", error: error.stack || String(error) });
    console.error(`FAIL ${name} ${JSON.stringify(details)}: ${error.message}`);
  } finally {
    await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  }
}

async function playAndSeek(video) {
  // Use a trusted click on an adjacent temporary button. Clicking the video
  // surface itself also toggles playback in some engines, causing double-toggle
  // races. Never replace or simulate the native controls.
  await video.evaluate(v => {
    const button = document.createElement("button");
    button.id = "marketing-play-trigger";
    button.textContent = "Verify manual playback";
    button.onclick = () => { v.play().catch(e => { v.dataset.playError = e.message; }); };
    v.after(button);
  });
  try {
    await video.page().locator("#marketing-play-trigger").click();
    await video.page().waitForFunction(v => v.error || v.dataset.playError || (v.currentTime > 0.15 && v.videoWidth > 0 && !v.paused), await video.elementHandle(), { timeout: 20000 });
  } catch (error) {
    const state = await video.evaluate(v => ({ src: v.currentSrc, time: v.currentTime, readyState: v.readyState, networkState: v.networkState, paused: v.paused, error: v.error?.message || v.dataset.playError }));
    throw new Error(`${error.message}; media state: ${JSON.stringify(state)}`);
  } finally {
    await video.page().locator("#marketing-play-trigger").evaluate(b => b.remove());
  }
  const playback = await video.evaluate(v => ({
    src: v.currentSrc, time: v.currentTime, width: v.videoWidth, height: v.videoHeight,
    duration: v.duration, error: v.error?.message || v.dataset.playError,
  }));
  assert(playback.width === 960 && playback.height === 640 && Number.isFinite(playback.duration) && !playback.error, JSON.stringify(playback));
  await video.evaluate(async v => {
    v.pause();
    const target = Math.max(0, v.duration - 1);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`seeked event timed out: ${v.currentSrc}`)), 15000);
      v.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
      v.currentTime = target;
    });
    if (v.seeking || v.readyState < 2 || Math.abs(v.currentTime - target) > 0.25)
      throw new Error(`Seek did not decode a frame: ${v.currentSrc}`);
  });
  const seekTime = await video.evaluate(v => v.currentTime);
  await video.evaluate(v => { v.play().catch(e => { v.dataset.playError = e.message; }); });
  await video.page().waitForFunction(
    ({ v, seekTime }) => v.error || v.dataset.playError || (v.currentTime > seekTime + 0.15 && !v.paused),
    { v: await video.elementHandle(), seekTime }, { timeout: 15000 },
  );
  assert(await video.evaluate(v => !v.error && !v.dataset.playError && !v.paused), "Playback failed after seeking");
  await video.evaluate(v => v.pause());
  return playback;
}

const checkedRanges = new Set();
for (const engine of engines) {
  const browser = await check("launch", { engine }, () => playwright[engine].launch({
    ...(engine === "chromium" ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] } : {}),
    timeout: 30000,
  }));
  if (!browser) {
    console.error(`Install matching browser/dependencies: pnpm --filter @workspace/receiptr exec playwright install --with-deps ${engine}`);
    continue;
  }
  try {
    for (const width of [1440, 390]) {
      for (const reducedMotion of ["reduce", "no-preference"]) {
        const details = { engine, width, reducedMotion };
        const id = `${engine}-${width}-${reducedMotion}`;
        const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion, serviceWorkers: "block" });
        const page = await ctx.newPage();
        page.setDefaultTimeout(20000);
        page.setDefaultNavigationTimeout(30000);
        const errors = [];
        const mediaFailures = [];
        page.on("pageerror", e => errors.push(e.message));
        page.on("response", r => {
          if (r.url().includes("/marketing/") && r.status() >= 400)
            mediaFailures.push(`${r.status()} ${r.url()}`);
        });
        try {
          const loaded = await check("landing", details, async () => {
            // Normal signed-out landing page. No auth bypass, fixtures, storage
            // state, API writes, integration actions, or response interception.
            await page.goto(url);
            await page.getByRole("heading", { name: "Receipts. Easy to find." }).waitFor();
            await page.locator("#demo button[data-demo]").first().waitFor();
            assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), reducedMotion === "reduce");
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(600);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Horizontal overflow");
            await page.screenshot({ path: `${out}/hero-${id}.png` });
            assert.equal(await page.locator("#demo button[data-demo]").count(), 3);
            assert.equal(await page.locator("video").count(), 0, "No video loads before a visitor chooses a demo");
            return true;
          });
          if (!loaded) continue;
          const triggers = page.locator("#demo button[data-demo]");
          for (const trigger of await triggers.all()) {
            await trigger.click();
            const dialog = page.getByRole("dialog");
            await dialog.waitFor();
            const video = dialog.locator("video");
            const clip = await video.getAttribute("aria-label");
            const clipDetails = { ...details, clip };
            const sources = await check("controls-poster-no-autoplay", clipDetails, async () => {
              await video.scrollIntoViewIfNeeded();
              await page.waitForTimeout(500);
              const properties = await video.evaluate(async v => {
                const image = new Image();
                image.src = v.poster;
                await image.decode();
                return {
                  autoplay: v.autoplay, controls: v.controls, preload: v.preload,
                  muted: v.muted, loop: v.loop, inline: v.playsInline,
                  fullscreenDisabled: v.getAttribute("controlslist")?.includes("nofullscreen"),
                  posterWidth: image.naturalWidth,
                  sources: Array.from(v.querySelectorAll("source"), s => ({
                    src: s.src, type: s.type, supported: v.canPlayType(s.type),
                    codec: s.type === "video/mp4" ? 'video/mp4; codecs="avc1.42E01E"' : 'video/webm; codecs="vp9"',
                    codecSupport: v.canPlayType(s.type === "video/mp4" ? 'video/mp4; codecs="avc1.42E01E"' : 'video/webm; codecs="vp9"'),
                  })),
                };
              });
              assert.deepEqual(
                [properties.autoplay, properties.controls, properties.preload, properties.muted, properties.loop, properties.inline, properties.fullscreenDisabled],
                [true, true, "metadata", true, false, true, true],
              );
              assert(properties.posterWidth > 0, "Poster must decode");
              assert.deepEqual(properties.sources.map(s => s.type), ["video/webm", "video/mp4"]);
              assert(properties.sources.every(s => new URL(s.src).origin === target.origin && s.src.includes("/api/storage/public-objects/marketing/")), "Only public marketing assets may be tested");
              return properties.sources;
            });
            if (!sources) {
              await dialog.getByRole("button", { name: "Close video", exact: true }).click();
              await dialog.waitFor({ state: "detached" });
              continue;
            }
            for (const source of sources) {
              if (!checkedRanges.has(source.src)) {
                checkedRanges.add(source.src);
                await check("byte-ranges", { src: source.src }, () => verifyRanges(ctx.request, source));
              }
            }
            await check("native-source-playback-seek", clipDetails, async () => {
              const firstSupported = sources.find(s => s.supported);
              assert(firstSupported, "Engine reports neither WebM nor MP4 support");
              const playback = await playAndSeek(video);
              assert.equal(playback.src, firstSupported.src, "Unexpected native source selection");
              return playback;
            });
            // Test both deliveries independently, without replacing sources on the
            // original video. Native selection above still tests the shipped DOM.
            for (const source of sources) {
              if (!source.codecSupport) {
                report.limitations.push({ ...clipDetails, type: source.type, codec: source.codec, reason: "canPlayType reports unsupported; single-format decode not available in this engine build" });
                console.warn(`LIMITED ${engine}: ${source.codec} unavailable; verify this format on a codec-enabled runner before release.`);
                continue;
              }
              await check("single-format-playback-seek", { ...clipDetails, type: source.type }, async () => {
                await page.evaluate(source => {
                  const v = document.createElement("video");
                  v.id = "marketing-format-probe";
                  v.src = source.src;
                  v.controls = true;
                  v.playsInline = true;
                  v.width = 480;
                  document.querySelector('[role="dialog"]').append(v);
                }, source);
                const probe = page.locator("#marketing-format-probe");
                try {
                  await probe.scrollIntoViewIfNeeded();
                  return await playAndSeek(probe);
                } finally {
                  await probe.evaluate(v => { v.pause(); v.removeAttribute("src"); v.load(); v.remove(); });
                }
              });
            }
            await check("modal-close-stops-playback", clipDetails, async () => {
              const element = await video.elementHandle();
              await dialog.getByRole("button", { name: "Close video", exact: true }).click();
              assert(await element.evaluate(v => v.paused), "Closing must stop playback immediately");
              await dialog.waitFor({ state: "detached" });
              assert.equal(await page.locator("video").count(), 0);
              assert.equal(new URL(page.url()).pathname, target.pathname, "Video must not navigate away from the landing page");
              return true;
            });
          }
          await check("feature-images-and-browser-errors", details, async () => {
            await page.locator("#demo").scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${out}/demos-${id}.png` });
            const tabs = page.getByRole("button", { name: /^(Capture|Find|Protect|Prove)$/ });
            assert.equal(await tabs.count(), 4);
            const featureSection = page.locator("section").filter({ has: page.getByRole("button", { name: "Capture", exact: true }) });
            for (const [title, file] of Object.entries({
              Capture: "capture-poster.webp", Find: "find-poster.webp",
              Protect: "protection.webp", Prove: "original-receipt.webp",
            })) {
              const tab = page.getByRole("button", { name: title, exact: true });
              await tab.click();
              // AnimatePresence briefly keeps the outgoing image mounted.
              // Wait for the requested source, not a snapshot of the old nodes.
              const image = featureSection.locator(`figure img[src$="/${file}"]`);
              await image.waitFor();
              await image.scrollIntoViewIfNeeded();
              await image.evaluate(i => i.decode());
              assert.equal(await tab.getAttribute("aria-pressed"), "true");
            }
            assert.deepEqual(mediaFailures, [], "Marketing asset HTTP failures");
            assert.deepEqual(errors, [], "Browser errors");
          });
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}
report.failedChecks = failures;
report.status = failures ? "failed" : (!fullMatrixRequested || report.limitations.length ? "limited" : "passed");
await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
console.log(`${failures} failure(s), ${report.limitations.length} codec limitation(s). Report and screenshots: ${out}`);
if (!fullMatrixRequested) console.warn("PARTIAL RUN: all three engines are required for the release matrix.");
process.exitCode = failures ? 1 : 0;
