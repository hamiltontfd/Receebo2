// Read-only verification against already-running DEV workflows. All non-Clerk
// writes (including aggregate landing beacons) are blocked in this browser.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
if (!process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev")) throw new Error("DEV preview required");
const output = path.resolve("generated-artifacts/marketing-v4/browser-check");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium",
  args: ["--no-sandbox"],
});
const report = [];
try {
  for (const batch of ["eu", "us", "br"]) {
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
      const context = await browser.newContext({
        viewport, locale: batch === "eu" ? "pt-PT" : batch === "br" ? "pt-BR" : "en-US",
        reducedMotion: "reduce", serviceWorkers: "block",
      });
      const page = await context.newPage();
      const errors = [];
      const mediaFailures = [];
      let blockedWrites = 0;
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => {
        if (new URL(response.url()).pathname.includes("/receebo-real-app/v4/") && response.status() !== 200) {
          mediaFailures.push({ pathname: new URL(response.url()).pathname, status: response.status() });
        }
      });
      await context.addInitScript(batch => {
        try { localStorage.setItem("receebo:visitorMarket", batch === "br" ? "BR" : batch === "us" ? "US" : "PT"); } catch {}
      }, batch);
      await page.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (/facebook|doubleclick|google-analytics/.test(url.hostname)) return route.abort();
        if (url.pathname.endsWith("/api/market/suggestion")) {
          // Country is opt-in PT in every case, independently of product market.
          return route.fulfill({ json: { country: "PT", market: "PT" } });
        }
        const clerk = url.pathname.includes("/api/__clerk") || /clerk\.(dev|com|accounts)/.test(url.hostname);
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !clerk) {
          blockedWrites++;
          return route.fulfill({ status: 204, body: "" });
        }
        return route.continue();
      });
      await page.goto(`${origin}${batch === "us" ? "/us" : "/"}`, { waitUntil: "domcontentloaded" });
      const hero = page.getByTestId("img-hero-library-phone");
      await expect(hero).toHaveAttribute("src", new RegExp(`/v4/${batch}/library-phone.webp`), { timeout: 30_000 });
      await hero.evaluate(img => img.decode());
      const reject = page.getByRole("button", { name: /^(Reject|Rejeitar|Recusar)$/ }).first();
      if (await reject.isVisible()) await reject.click();
      await page.screenshot({ path: path.join(output, `${batch}-${name}-hero.png`) });
      await expect(page.locator('a[href="#demo"]').first()).toBeVisible();
      expect(await page.locator('source[src*="receebo-promo-"]').count()).toBe(0);
      if (batch === "us") {
        expect(await page.locator("body").innerText()).not.toContain("€");
        expect(await page.locator("img").evaluateAll(images => images.map(img => img.alt).join("\n"))).not.toContain("€");
      }
      const protect = page.getByRole("button", { name: /^(Go to Protect|Ir para Proteger)$/ });
      await protect.scrollIntoViewIfNeeded();
      await protect.click();
      const image = page.getByTestId("why-media-cell").locator('img[src*="protection.webp"]');
      await expect(image).toBeVisible();
      await image.evaluate(img => img.decode());
      const dimensions = await image.evaluate(img => ({
        natural: [img.naturalWidth, img.naturalHeight],
        fit: getComputedStyle(img).objectFit,
        rendered: [Math.round(img.getBoundingClientRect().width), Math.round(img.getBoundingClientRect().height)],
      }));
      expect(dimensions.natural).toEqual([1070, batch === "eu" ? 2190 : batch === "us" ? 1916 : 2010]);
      expect(dimensions.fit).toBe("contain");
      await page.getByTestId("why-media-cell").screenshot({ path: path.join(output, `${batch}-${name}-protection.png`) });
      const find = page.getByRole("button", { name: /^(Play Find demo|Reproduzir demonstração: Encontrar)$/ });
      await find.scrollIntoViewIfNeeded();
      await find.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const sources = await dialog.locator("source").evaluateAll(items => items.map(item => item.getAttribute("src")));
      expect(sources.every(src => src.includes(`/v4/${batch}/find.`))).toBe(true);
      expect(await dialog.innerText()).not.toMatch(/em inglês/i);
      expect(errors).toEqual([]);
      expect(mediaFailures).toEqual([]);
      report.push({ batch, viewport: name, dimensions, blockedWrites, runtimeErrors: errors, mediaFailures });
      console.log(`${batch}/${name} PASS; ${blockedWrites} non-Clerk writes blocked`);
      await context.close();
    }
  }
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: String(error), completed: report }, null, 2));
  throw error;
} finally { await browser.close(); }
