// @vitest-environment node
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root));

test("search and installed-app icons are real PNGs at the declared sizes", async () => {
  for (const [path, size] of [
    ["favicon.png", 96],
    ["favicon-outline.png", 96],
    ["icons/receebo-outline-180.png", 180],
    ["icons/receebo-outline-192.png", 192],
    ["icons/receebo-outline-512.png", 512],
    ["icons/receebo-outline-maskable-512.png", 512],
    ["icons/receebo-app-180.png", 180],
    ["icons/receebo-app-192.png", 192],
    ["icons/receebo-app-512.png", 512],
    ["icons/receebo-app-maskable-512.png", 512],
    ["icons/receebo-badge-96.png", 96],
  ]) {
    const png = await read(`public/${path}`);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size, path);
    assert.equal(png.readUInt32BE(20), size, path);
  }
});

test("metadata, manifest and notifications use the fresh icon URLs", async () => {
  const html = (await read("index.html")).toString();
  const config = (await read("vite.config.ts")).toString();
  const worker = (await read("src/sw.ts")).toString();
  assert.match(html, /sizes="96x96" href="%BASE_URL%favicon-outline\.png"/);
  assert.match(html, /apple-touch-icon[^>]+receebo-outline-180\.png/);
  for (const name of ["receebo-outline-192.png", "receebo-outline-512.png", "receebo-outline-maskable-512.png"]) {
    assert.ok(config.includes(name), name);
  }
  assert.ok(worker.includes("receebo-outline-192.png"));
  assert.ok(worker.includes("receebo-badge-96.png"));
  assert.equal((await read("public/favicon.svg")).toString(), (await read("public/logo-mark.svg")).toString());
});
