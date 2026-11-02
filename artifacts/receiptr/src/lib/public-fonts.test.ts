import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const css = readFileSync("src/index.css", "utf8");

describe("public font loading", () => {
  it("loads only the theme fonts in one non-render-blocking stylesheet", () => {
    const page = new DOMParser().parseFromString(
      html.replace(/<noscript>[\s\S]*?<\/noscript>/g, ""),
      "text/html",
    );
    const fonts = page.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]',
    );
    expect(fonts).toHaveLength(1);
    const link = fonts[0];
    expect(link.media).toBe("print");
    expect(link.getAttribute("onload")).toBe("this.onload=null;this.media='all'");
    const url = new URL(link.href);
    expect(url.searchParams.getAll("family")).toEqual([
      "Plus Jakarta Sans:wght@400;500;600;700;800",
      "Spline Sans Mono:wght@400;500;600",
    ]);
    expect(url.searchParams.get("display")).toBe("swap");
    expect(html).not.toContain("family=Inter");
  });

  it("keeps the same fonts available without JavaScript", () => {
    const fallback = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
    expect(fallback).toBeTruthy();
    const page = new DOMParser().parseFromString(fallback!, "text/html");
    const link = page.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
    expect(link?.href).toContain("family=Plus+Jakarta+Sans");
    expect(link?.href).toContain("family=Spline+Sans+Mono");
    expect(link?.media).toBe("");
  });

  it("avoids external CSS imports and retains system font fallbacks", () => {
    expect(css).not.toMatch(/@import\s+(?:url\()?['"]https?:/);
    expect(css).toContain("'Plus Jakarta Sans', sans-serif");
    expect(css).toContain("'Spline Sans Mono', monospace");
  });
});
