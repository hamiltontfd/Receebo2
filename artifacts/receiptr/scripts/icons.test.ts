import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = resolve(import.meta.dirname, "../public");
const logo = readFileSync(resolve(publicDir, "logo.svg"), "utf8");
const symbolParts = () => [
  logo.match(/<rect\b[^>]*\/>/)![0],
  ...[...logo.matchAll(/<path\b[^>]*\/>/g)].slice(0, 2).map(([path]) => path),
  logo.match(/<circle\b[^>]*\/>/)![0],
];
function png(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

describe("Receebo brand icons", () => {
  it("keeps the original symbol geometry on the white app-icon source", () => {
    const source = readFileSync(resolve(publicDir, "icons/icon-source.svg"), "utf8");
    for (const part of symbolParts()) expect(source).toContain(part);
    expect(source).toContain('<rect width="512" height="512" fill="#ffffff"/>');
    expect(source.match(/<path\b/g)).toHaveLength(2);
  });
  it.each(["favicon.svg", "logo-mark.svg"])("crops %s to the black rounded outline, with no white margin", (file) => {
    const mark = readFileSync(resolve(publicDir, file), "utf8");
    expect(mark).toContain('viewBox="3 3 48 48"');
    for (const part of symbolParts()) expect(mark).toContain(part);
    expect(mark.match(/<path\b/g)).toHaveLength(2);
    expect(mark).not.toContain("#ffffff");
  });
  it.each([
    ["favicon-32.png", 32],
    ["receebo-white-180.png", 180],
    ["receebo-white-192.png", 192],
    ["receebo-white-512.png", 512],
    ["receebo-white-maskable-512.png", 512],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-512-maskable.png", 512],
    ["badge-96.png", 96],
  ])("ships %s at the declared size", (filename, size) => {
    const { width, height } = png(resolve(publicDir, "icons", String(filename)));
    expect(width).toBe(size);
    expect(height).toBe(size);
  });
  it("ships the push badge with an alpha channel (white silhouette on transparent)", () => {
    expect(png(resolve(publicDir, "icons/badge-96.png")).colorType).toBe(6);
  });
  it("ships a multi-size favicon.ico", () => {
    const ico = readFileSync(resolve(publicDir, "favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
  });
  it("uses the cropped favicon and a dedicated Apple touch icon", () => {
    const html = readFileSync(resolve(publicDir, "../index.html"), "utf8");
    expect(html).toContain('href="%BASE_URL%favicon.svg"');
    expect(html).toContain('href="%BASE_URL%favicon.ico"');
    expect(html).toContain('href="%BASE_URL%icons/favicon-32.png"');
    expect(html).toContain('sizes="180x180" href="%BASE_URL%icons/receebo-white-180.png"');
    expect(html).not.toContain("receebo-white-32.png");
    expect(html).not.toContain('href="%BASE_URL%logo.svg"');
  });
});
