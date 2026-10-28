import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = resolve(import.meta.dirname, "../public");
describe("Receebo brand icons", () => {
  it("preserves the original symbol geometry on an opaque white background", () => {
    const logo = readFileSync(resolve(publicDir, "logo.svg"), "utf8");
    const favicon = readFileSync(resolve(publicDir, "favicon.svg"), "utf8");
    const symbolPaths = [...logo.matchAll(/<path\b[^>]*\/>/g)].slice(0, 2);
    for (const [path] of symbolPaths) expect(favicon).toContain(path);
    expect(favicon).toContain(logo.match(/<circle\b[^>]*\/>/)![0]);
    expect(favicon).toContain('<rect width="512" height="512" fill="#ffffff"/>');
    expect(favicon.match(/<path\b/g)).toHaveLength(2);
  });
  it("ships the bare symbol as logo-mark.svg, cropped to the 48x48 mark", () => {
    const logo = readFileSync(resolve(publicDir, "logo.svg"), "utf8");
    const mark = readFileSync(resolve(publicDir, "logo-mark.svg"), "utf8");
    expect(mark).toContain('viewBox="3 3 48 48"');
    expect(mark).toContain(logo.match(/<rect\b[^>]*\/>/)![0]);
    for (const [path] of [...logo.matchAll(/<path\b[^>]*\/>/g)].slice(0, 2)) expect(mark).toContain(path);
    expect(mark).toContain(logo.match(/<circle\b[^>]*\/>/)![0]);
    expect(mark.match(/<path\b/g)).toHaveLength(2);
    expect(mark).not.toContain("#ffffff");
  });
  it.each([
    ["receebo-white-32.png", 32],
    ["receebo-white-180.png", 180],
    ["receebo-white-192.png", 192],
    ["receebo-white-512.png", 512],
    ["receebo-white-maskable-512.png", 512],
  ])("ships %s at the declared size", (filename, size) => {
    const png = readFileSync(resolve(publicDir, "icons", String(filename)));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });
  it("uses the symbol favicon and a dedicated Apple touch icon", () => {
    const html = readFileSync(resolve(publicDir, "../index.html"), "utf8");
    expect(html).toContain('href="%BASE_URL%favicon.svg"');
    expect(html).toContain('sizes="180x180" href="%BASE_URL%icons/receebo-white-180.png"');
    expect(html).not.toContain('href="%BASE_URL%logo.svg"');
  });
});
