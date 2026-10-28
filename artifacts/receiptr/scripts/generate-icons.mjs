import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

// Keep the original brand geometry; never redraw the symbol by hand.
const publicDir = resolve(import.meta.dirname, "../public");
const logo = await readFile(resolve(publicDir, "logo.svg"), "utf8");
const rect = logo.match(/<rect\b[^>]*\/>/)?.[0];
const paths = [...logo.matchAll(/<path\b[^>]*\/>/g)].slice(0, 2).map(([path]) => path);
const circle = logo.match(/<circle\b[^>]*\/>/)?.[0];
if (!rect || paths.length !== 2 || !circle) throw new Error("Original logo symbol not found");
const symbol = [rect, ...paths, circle].join("\n");
function svg(padding) {
  const scale = (512 - padding * 2) / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#ffffff"/>
<g transform="translate(${padding} ${padding}) scale(${scale}) translate(-3 -3)">
${symbol}
</g>
</svg>\n`;
}
const standard = svg(48);
await writeFile(resolve(publicDir, "favicon.svg"), standard);
await writeFile(resolve(publicDir, "icons/icon-source.svg"), standard);
// Bare symbol (no white canvas) for in-app UI such as the install bar.
await writeFile(
  resolve(publicDir, "logo-mark.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="3 3 48 48" fill="none">\n${symbol}\n</svg>\n`,
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage();
  for (const [filename, size, padding] of [
    ["receebo-white-32.png", 32, 48],
    ["receebo-white-180.png", 180, 48],
    ["receebo-white-192.png", 192, 48],
    ["receebo-white-512.png", 512, 48],
    // The symbol fits entirely inside the maskable icon's central safe circle.
    ["receebo-white-maskable-512.png", 512, 112],
  ]) {
    const bytes = await page.evaluate(async ({ source, size }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(source)}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { source: svg(padding), size });
    await writeFile(resolve(publicDir, "icons", filename), Buffer.from(bytes, "base64"));
    console.log(`Generated ${filename} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
