import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

// Keep the original brand geometry; never redraw the symbol by hand.
// Source of truth: public/logo.svg (the header/landing logo). Every icon below
// is derived from its 48×48 mark so the brand stays identical everywhere.
const publicDir = resolve(import.meta.dirname, "../public");
const mobileImages = resolve(import.meta.dirname, "../../receiptr-mobile/assets/images");
const logo = await readFile(resolve(publicDir, "logo.svg"), "utf8");
const rect = logo.match(/<rect\b[^>]*\/>/)?.[0];
const paths = [...logo.matchAll(/<path\b[^>]*\/>/g)].slice(0, 2).map(([path]) => path);
const circle = logo.match(/<circle\b[^>]*\/>/)?.[0];
if (!rect || paths.length !== 2 || !circle) throw new Error("Original logo symbol not found");
const symbol = [rect, ...paths, circle].join("\n");

/** The mark on an opaque white square (app icons, Apple touch icon). */
function svg(padding) {
  const scale = (512 - padding * 2) / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#ffffff"/>
<g transform="translate(${padding} ${padding}) scale(${scale}) translate(-3 -3)">
${symbol}
</g>
</svg>\n`;
}
/** The bare mark cropped to its black rounded outline, transparent outside it. */
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="3 3 48 48" fill="none">\n${symbol}\n</svg>\n`;

const standard = svg(48);
await writeFile(resolve(publicDir, "icons/icon-source.svg"), standard);
// Favicon: cropped to the rounded outline (no white margin) so it reads bigger in tabs.
await writeFile(resolve(publicDir, "favicon.svg"), mark);
// Bare symbol for in-app UI such as the install bar.
await writeFile(resolve(publicDir, "logo-mark.svg"), mark);
await rm(resolve(publicDir, "icons/receebo-white-32.png"), { force: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage();
  const render = (source, size, { badge = false } = {}) => page.evaluate(async ({ source, size, badge }) => {
    const image = new Image();
    image.src = `data:image/svg+xml;base64,${btoa(source)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, size, size);
    if (badge) {
      // Android badge: white silhouette on transparent. The dark parts of the
      // mark (outline + dot) become opaque white; the white strokes become holes.
      const data = ctx.getImageData(0, 0, size, size);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const luminance = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
        // The brand black (#1A1A1A / #202020) maps to fully opaque.
        const alpha = Math.round(Math.min(1, (1 - luminance) / 0.85) * px[i + 3]);
        px[i] = px[i + 1] = px[i + 2] = 255;
        px[i + 3] = alpha;
      }
      ctx.putImageData(data, 0, 0);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, { source, size, badge }).then((b64) => Buffer.from(b64, "base64"));

  const outputs = [
    [resolve(publicDir, "icons/favicon-32.png"), mark, 32],
    [resolve(publicDir, "icons/receebo-white-180.png"), standard, 180],
    [resolve(publicDir, "icons/receebo-white-192.png"), standard, 192],
    [resolve(publicDir, "icons/receebo-white-512.png"), standard, 512],
    // The symbol fits entirely inside the maskable icon's central safe circle.
    [resolve(publicDir, "icons/receebo-white-maskable-512.png"), svg(112), 512],
    // Legacy names kept for devices that cached the pre-Receebo manifest.
    [resolve(publicDir, "icons/icon-192.png"), standard, 192],
    [resolve(publicDir, "icons/icon-512.png"), standard, 512],
    [resolve(publicDir, "icons/icon-512-maskable.png"), svg(112), 512],
    // Expo companion app icon/splash (opaque, as iOS requires).
    [resolve(mobileImages, "icon.png"), standard, 1024],
  ];
  for (const [file, source, size] of outputs) {
    await writeFile(file, await render(source, size));
    console.log(`Generated ${file.replace(resolve(publicDir, "../.."), "")} (${size}×${size})`);
  }
  await writeFile(resolve(publicDir, "icons/badge-96.png"), await render(mark, 96, { badge: true }));
  console.log("Generated icons/badge-96.png (96×96, monochrome)");

  // favicon.ico (16/32/48) with embedded PNGs, for browsers that ask for /favicon.ico.
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) pngs.push(await render(mark, size));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size, entry); header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += pngs[i].length;
  });
  await writeFile(resolve(publicDir, "favicon.ico"), Buffer.concat([header, ...pngs]));
  console.log("Generated favicon.ico (16/32/48)");
} finally {
  await browser.close();
}
