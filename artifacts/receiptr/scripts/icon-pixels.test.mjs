// @vitest-environment node
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { iconBrowserOptions } from "./icon-browser.mjs";

const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "public");
const read = (file) => readFile(resolve(publicDir, file));

test("all icon pixels preserve the original mark; aliases, ICO and regeneration stay consistent", async () => {
  const protectedPaths = [
    resolve(root, "../receiptr-mobile/assets/images/icon.png"),
    resolve(publicDir, "icons/badge-96.png"),
    resolve(publicDir, "icons/receebo-badge-96.png"),
    resolve(publicDir, "logo.svg"),
    resolve(publicDir, "logo-mark.svg"),
  ];
  const protectedBefore = await Promise.all(protectedPaths.map((file) => readFile(file)));
  const files = [
    ...(await readdir(publicDir)).filter((f) => /^(favicon|apple-touch-icon)/.test(f)),
    ...(await readdir(resolve(publicDir, "icons"))).map((f) => `icons/${f}`),
  ];
  const before = await Promise.all(files.map(read));
  execFileSync(process.execPath, ["scripts/generate-icons.mjs", "--check"], { cwd: root, stdio: "pipe" });
  const after = await Promise.all(files.map(read));
  before.forEach((bytes, i) => assert.deepEqual(after[i], bytes, `deterministic: ${files[i]}`));
  for (const [i, path] of protectedPaths.entries()) {
    assert.deepEqual(await readFile(path), protectedBefore[i], `must not change: ${path}`);
  }

  // Independently crop the ORIGINAL wordmark SVG, not the generated icon source.
  const logo = (await read("logo.svg")).toString();
  const original = logo.replace(/width="191" height="54" viewBox="0 0 191 54"/,
    'width="48" height="48" viewBox="3 3 48 48"');
  const browser = await chromium.launch({
    ...iconBrowserOptions(),
  });
  try {
    const page = await browser.newPage();
    async function pixels(bytes, size, svg = false, variant = "transparent") {
      const result = await page.evaluate(async ({ b64, size, svg, variant }) => {
        const image = new Image();
        image.src = `data:image/${svg ? "svg+xml" : "png"};base64,${b64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (variant !== "transparent") {
          ctx.fillStyle = "#1A1A1A";
          ctx.fillRect(0, 0, size, size);
        }
        const pad = variant === "maskable" ? size * 112 / 512 : 0;
        ctx.drawImage(image, pad, pad, size - pad * 2, size - pad * 2);
        const bytes = ctx.getImageData(0, 0, size, size).data;
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        return btoa(binary);
      }, { b64: Buffer.from(bytes).toString("base64"), size, svg, variant });
      return Buffer.from(result, "base64");
    }
    for (const file of files.filter((f) => /\.(png|svg)$/.test(f) && !/badge/.test(f))) {
      const bytes = await read(file);
      const svg = file.endsWith(".svg");
      const size = svg ? 48 : bytes.readUInt32BE(16);
      const variant = /maskable/.test(file) ? "maskable"
        : /180|apple-touch/.test(file) ? "opaque" : "transparent";
      const actual = await pixels(bytes, size, svg);
      const expected = await pixels(original, size, true, variant);
      // Same geometry and colors at every pixel, including white interior.
      // Opaque compositions use an SVG group and can differ by one antialias level.
      let maxDifference = 0;
      for (let i = 0; i < actual.length; i++) {
        maxDifference = Math.max(maxDifference, Math.abs(actual[i] - expected[i]));
      }
      assert.ok(maxDifference <= (variant === "transparent" ? 0 : 2), `${file}: pixel difference ${maxDifference}`);
      const at = (x, y) => Array.from(actual.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));
      for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
        assert.deepEqual(at(x, y), variant === "transparent" ? [0, 0, 0, 0] : [26, 26, 26, 255], `${file}: corner`);
      }
      if (variant === "maskable") {
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          assert.equal(at(x, y)[3], 255, `${file}: opaque`);
          // Every non-background pixel (essential artwork) survives circular masks.
          if (at(x, y).some((v, i) => i < 3 && v > 28)) {
            assert.ok(Math.hypot(x + .5 - size / 2, y + .5 - size / 2) < size * .4, `${file}: safe zone`);
          }
        }
      } else {
        assert.deepEqual(at(Math.floor(size / 2), 0), [26, 26, 26, 255], `${file}: no outer padding`);
        assert.deepEqual(at(Math.floor(size * .15), Math.floor(size * .5)), [255, 255, 255, 255], `${file}: white interior`);
      }
    }
    for (const file of ["favicon.ico", "favicon-outline.ico"]) {
      const ico = await read(file);
      assert.equal(ico.readUInt16LE(4), 3);
      for (const [i, size] of [16, 32, 48].entries()) {
        const entry = 6 + i * 16;
        assert.equal(ico[entry], size);
        const offset = ico.readUInt32LE(entry + 12);
        const png = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8));
        assert.equal(png.readUInt32BE(16), size);
        assert.deepEqual(await pixels(png, size), await pixels(original, size, true), `${file}: ${size}px`);
      }
    }
  } finally { await browser.close(); }
}, 60000);
