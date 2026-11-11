// DEV component integration check. Clerk and all API traffic are browser-only
// fixtures: never starts the API, signs in, or writes to the database.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { iconBrowserOptions } from "./icon-browser.mjs";

const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const output = resolve(import.meta.dirname, "../../../generated-artifacts/consent");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...iconBrowserOptions(), args: ["--no-sandbox"] });
const harness = `
import React from "/node_modules/.vite/deps/react.js";
import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js";
import { MarketProvider } from "/src/components/MarketProvider.tsx";
import { CookieConsent } from "/src/components/CookieConsent.tsx";
import { AdsRuntime } from "/src/components/AdsRuntime.tsx";
import { useCookieConsent } from "/src/lib/useCookieConsent.ts";
function Choices() {
  const {region} = useCookieConsent();
  return React.createElement(React.Fragment,null,
    React.createElement("p",{"data-testid":"jurisdiction"},region),
    React.createElement(CookieConsent,{region}),React.createElement(AdsRuntime));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(MarketProvider,null,React.createElement(Choices)));
`;
try {
  for (const scenario of [
    { name: "eu-home", path: "/", country: "PT" },
    { name: "eu-us-page", path: "/us", country: "PT" },
    { name: "us-reject", path: "/us", country: "US" },
  ]) {
    const context = await browser.newContext({ locale: "en-US", serviceWorkers: "block" });
    let pixels = 0;
    let writes = 0;
    await context.route("**/src/main.tsx*", async route => {
      const original = await (await route.fetch()).text();
      let body = harness;
      for (const name of ["react", "react-dom_client"]) {
        const match = original.match(new RegExp(`["']([^"']*/${name}\\.js\\?[^"']+)["']`));
        if (match) body = body.replace(`/node_modules/.vite/deps/${name}.js`, match[1]);
      }
      return route.fulfill({ contentType: "application/javascript", body });
    });
    await context.route(/\/@clerk_react\.js(?:\?|$)/, route => route.fulfill({
      contentType: "application/javascript",
      body: `export const useAuth=()=>({isLoaded:true,isSignedIn:false,userId:null});
        export const useUser=()=>({isLoaded:true,isSignedIn:false,user:null});
        export const useClerk=()=>({});`,
    }));
    await context.route("**/api/**", async route => {
      if (route.request().method() !== "GET") writes++;
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/market/suggestion") {
        await new Promise(resolve => setTimeout(resolve, 300));
        return route.fulfill({ json: { country: scenario.country, market: scenario.country === "US" ? "US" : "PT" } });
      }
      return route.fulfill({ json: {} });
    });
    await context.route("https://connect.facebook.net/**", route => {
      pixels++;
      return route.fulfill({ contentType: "application/javascript", body: `
        window.__metaCalls=[];
        window.fbq=Object.assign((...args)=>window.__metaCalls.push(args),{loaded:true});
      ` });
    });
    const page = await context.newPage();
    page.on("pageerror", error => console.error("Consent harness runtime:", error.message
      .replace(/https?:\/\/\S+/g, "[URL omitted]")
      .replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 250)));
    await page.goto(origin + scenario.path, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("jurisdiction")).toHaveText(scenario.country === "US" ? "US" : "EU");
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    if (scenario.country === "PT") {
      expect(pixels).toBe(0);
      await expect(page.getByTestId("cookie-banner")).toContainText("stay off until you accept");
      await page.getByTestId("cookie-accept").click();
      await expect.poll(() => pixels).toBe(1);
    } else {
      await expect.poll(() => pixels).toBe(1);
      await context.addCookies([
        { name: "_fbp", value: "fixture", url: origin },
        { name: "_fbc", value: "fixture", url: origin },
        { name: "receebo:ad-attribution", value: "fixture", url: origin },
      ]);
      await page.evaluate(() => localStorage.setItem("receebo:ad-attribution", '{"utmSource":"fixture"}'));
      await page.getByTestId("cookie-reject").click();
      await expect.poll(() => page.evaluate(() => window.__metaCalls?.some(c => c[0] === "consent" && c[1] === "revoke"))).toBe(true);
      expect((await context.cookies()).filter(c => ["_fbp", "_fbc", "receebo:ad-attribution"].includes(c.name))).toHaveLength(0);
      expect(await page.evaluate(() => localStorage.getItem("receebo:ad-attribution"))).toBeNull();
      const count = await page.evaluate(() => window.__metaCalls.filter(c => c[0] === "track").length);
      await page.evaluate(() => window.dispatchEvent(new Event("receebo:consent-changed")));
      expect(await page.evaluate(() => window.__metaCalls.filter(c => c[0] === "track").length)).toBe(count);
    }
    expect(writes).toBe(0);
    expect((await context.cookies()).find(c => c.name === "receebo:cookie-consent")?.secure).toBe(true);
    await page.screenshot({ path: resolve(output, `${scenario.name}.png`) });
    console.log(`${scenario.name}: PASS (fixture API/Meta; no database writes)`);
    await context.close();
  }
} catch {
  console.error("Consent browser verification failed; no token-bearing browser errors printed.");
  process.exitCode = 1;
} finally {
  await browser.close();
}
