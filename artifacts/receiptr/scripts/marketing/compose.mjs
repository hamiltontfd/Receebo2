import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = path.resolve("generated-artifacts/receebo-marketing");
const image = async name => `data:image/png;base64,${(await readFile(`${out}/sources/${name}.png`)).toString("base64")}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
  await page.setContent(`<html><body style="margin:0;background:radial-gradient(ellipse at 80% 20%,#ede9fe,#eff6ff 55%,#fafafa);overflow:hidden">
    <img src="${await image("library-phone")}" style="position:absolute;left:80px;top:65px;width:450px;border:1px solid #e5e7eb;border-radius:28px;box-shadow:0 30px 70px #25204a22">
    <img src="${await image("receipt-desktop")}" style="position:absolute;left:570px;top:170px;width:540px;border:1px solid #e5e7eb;border-radius:24px;box-shadow:0 30px 70px #25204a22">
    </body></html>`);
  await page.locator("img").last().evaluate(img => img.decode());
  await page.screenshot({ path: `${out}/sources/hero.png` });
  for (const width of [600, 1200]) execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", `${out}/sources/hero.png`,
    "-vf", `scale=${width}:-1`, "-c:v", "libwebp", "-quality", "88", `${out}/web/hero-${width}.webp`,
  ]);
} finally { await browser.close(); }
