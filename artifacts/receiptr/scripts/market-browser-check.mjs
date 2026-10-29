import { chromium, expect } from "@playwright/test";

// Standalone public-page smoke test. It never signs in or bypasses app auth.
const base = process.env.MARKET_TEST_BASE_URL ?? "http://127.0.0.1:80/";
const browser = await chromium.launch({
  executablePath: process.env.MARKET_CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const width of [320, 375, 640, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "pt-BR" });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const select = page.locator('[data-testid="select-market"]:visible');
    await expect(select).toBeEnabled();
    await expect(page.locator("h1")).toContainText("Recibos.");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const triggerBox = await select.boundingBox();
    expect(triggerBox.width).toBeLessThan(120);
    await select.click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(3);
    await page.getByTestId("option-market-BR").click();
    await expect(page.getByTestId("text-market-current")).toHaveText("BR");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(select).toBeEnabled();
    await expect(page.getByTestId("text-market-current")).toHaveText("BR");
    expect(await page.evaluate(() => localStorage.getItem("receebo:visitorMarket"))).toBe("BR");
    await context.close();
    console.log(`Public selector ${width}px: visible, no overflow, explicit choice survives reload`);
  }
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, locale: "pt-BR" });
  const page = await context.newPage();
  // Deterministic US GeoIP response, independent of the runner's private IP.
  await page.route("**/api/market/suggestion", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ country: "US", market: "US" }),
  }));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const select = page.locator('[data-testid="select-market"]:visible');
  await expect(page.getByTestId("text-market-current")).toHaveText("EUA");
  await expect(page.getByTestId("status-market-suggestion")).toHaveCount(0);
  expect(await page.evaluate(() => navigator.language)).toBe("pt-BR");
  expect(await page.evaluate(() => localStorage.getItem("receebo:visitorMarket"))).toBeNull();
  await select.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status-market-suggestion")).toBeVisible();
  await page.locator('[data-testid="button-market-confirm"]:visible').click();
  await expect(page.locator('[data-testid="status-market-suggestion"]:visible')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("receebo:visitorMarket"))).toBe("US");
  await context.close();
  console.log("US suggestion with pt-BR browser: unconfirmed until explicit confirmation");
  for (const [locale, headline] of [["pt-PT", "Recibos."], ["en-US", "Receipts."]]) {
    const localizedContext = await browser.newContext({ locale, viewport: { width: 375, height: 900 } });
    const localizedPage = await localizedContext.newPage();
    await localizedPage.route("**/api/market/suggestion", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ country: "BR", market: "BR" }),
    }));
    await localizedPage.goto(base, { waitUntil: "domcontentloaded" });
    await expect(localizedPage.locator("h1")).toContainText(headline);
    await expect(localizedPage.getByTestId("text-market-current")).toHaveText("BR");
    await localizedContext.close();
    console.log(`${locale} language remains independent of suggested BR market`);
  }
  for (const [country, market, label] of [["US", "US", "EUA"], ["DE", "PT", "PT / UE"], ["BR", "BR", "BR"], ["JP", null, "Região"]]) {
    const ctx = await browser.newContext({ locale: "pt-BR", viewport: { width: 375, height: 900 } });
    const page = await ctx.newPage();
    let externalCalls = 0;
    // Server-side GeoIP only (2 Nov 2026): the browser never contacts a third-party location service.
    await page.route("**/api/market/suggestion", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ country, market }),
    }));
    await page.route("**://api.country.is/**", (route) => { externalCalls++; return route.abort(); });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("select-market")).toBeEnabled();
    await expect(page.getByTestId("text-market-current")).toHaveText(label);
    await expect(page.locator("h1")).toContainText("Recibos.");
    expect(externalCalls).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem("receebo:visitorMarket"))).toBeNull();
    await ctx.close();
    console.log(`Server suggestion ${country}: ${label}, language unchanged, no third-party lookup, nothing stored`);
  }
} finally {
  await browser.close();
}
