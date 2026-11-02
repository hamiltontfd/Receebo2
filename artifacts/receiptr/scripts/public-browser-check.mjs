import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright";
import { publicHandler } from "./serve-public.mjs";

const server = http.createServer(publicHandler());
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.PWA_CHROMIUM_PATH || "/repl/tools/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  for (const route of ["/", "/privacy", "/terms", "/missing-page"]) {
    const page = await noJs.newPage();
    const response = await page.goto(origin + route);
    assert.equal(response.status(), route === "/missing-page" ? 404 : 200);
    await page.locator("h1").waitFor({ state: "visible" });
    assert.ok(await page.locator("main, [data-public-document]").first().innerText());
    if (route === "/") {
      await page.getByText("Simple, transparent pricing.").waitFor({ state: "visible" });
      assert.ok(await page.locator('a[href="/privacy"]').count());
    }
    await page.close();
  }
  await noJs.close();

  for (const locale of ["en-US", "pt-BR"]) {
    const context = await browser.newContext({ locale, reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    for (const route of ["/", "/privacy", "/terms"]) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error" && /hydrat|didn't match|server rendered|#418|#423|#425/i.test(message.text())) errors.push(message.text());
      });
      // No API process or integration jobs are needed for a public-page check.
      await page.route("**/api/**", request => request.fulfill({ status: 503, body: "{}" }));
      await page.goto(origin + route);
      await page.waitForTimeout(1800);
      assert.deepEqual(errors.filter(error => /hydrat|didn't match|server rendered|#418|#423|#425/i.test(error)), [],
        `Hydration errors on ${route}, ${locale}: ${errors.join("\n")}`);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://receebo.net${route}`);
      console.log(`Browser: ${route}, ${locale}: no hydration errors`);
      await page.close();
    }
    await context.close();
  }
  console.log("No-JavaScript public pages, real 404 and mobile hydration checked.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
