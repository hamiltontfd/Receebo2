import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { publicHandler } from "./serve-public.mjs";

let server, url;
before(async () => {
  server = http.createServer(publicHandler());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

for (const [route, title, phrase] of [
  ["/", "Receebo — Receipts. Easy to find.", "Simple, transparent pricing."],
  ["/privacy", "Privacy Policy — Receebo", "data controller"],
  ["/terms", "Terms of Service — Receebo", "These Terms govern"],
]) {
  test(`${route}: initial HTML contains page body, canonical and sharing metadata`, async () => {
    const response = await fetch(url + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.title, title);
    assert.ok(doc.querySelector("main").textContent.includes(phrase));
    assert.equal(doc.querySelectorAll("h1").length, 1);
    const canonical = doc.querySelector('link[rel="canonical"]').href;
    assert.equal(canonical, `https://receebo.net${route}`);
    assert.equal(doc.querySelector('meta[property="og:url"]').content, canonical);
    assert.equal(doc.querySelector('meta[property="og:title"]').content, title);
    assert.equal(doc.querySelector('meta[name="twitter:title"]').content, title);
    assert.equal(doc.querySelector('meta[property="og:description"]').content,
      doc.querySelector('meta[name="description"]').content);
    assert.equal(doc.querySelector('meta[name="twitter:description"]').content,
      doc.querySelector('meta[name="description"]').content);
    assert.equal(doc.querySelector('meta[name="robots"]').content, "index, follow");
    assert.ok(doc.querySelector('a[href="/privacy"]'));
    assert.ok(doc.querySelector('a[href="/terms"]'));
    assert.equal(doc.querySelector("#root").dataset.publicPath, route);
    if (route === "/") {
      assert.match(doc.querySelector("main").textContent, /€2\.99/);
      assert.match(doc.querySelector("main").textContent, /€24\.99/);
      assert.match(doc.querySelector("main").textContent, /What are founding prices/);
      assert.match(doc.querySelector("main").textContent, /They stay available/);
    }
  });
}

test("sitemap and robots expose only indexable public canonical pages", async () => {
  const response = await fetch(url + "/sitemap.xml");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  const doc = new JSDOM(await response.text(), { contentType: "application/xml" }).window.document;
  assert.deepEqual([...doc.querySelectorAll("loc")].map(node => node.textContent),
    ["/", "/privacy", "/terms"].map(route => `https://receebo.net${route}`));
  const robots = await fetch(url + "/robots.txt");
  assert.match(await robots.text(), /Sitemap: https:\/\/receebo.net\/sitemap.xml/);
});

for (const route of ["/missing-page", "/removed/article", "/receipts/123/unknown", "/settings/missing", "/missing.xml", "/privacy/index.html", "/.env", "/app.html"]) {
  test(`${route}: real 404 with noindex and a helpful page`, async () => {
    const response = await fetch(url + route);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, follow");
    const doc = new JSDOM(await response.text()).window.document;
    assert.equal(doc.querySelector('meta[name="robots"]').content, "noindex, follow");
    assert.equal(doc.querySelector('link[rel="canonical"]'), null);
    assert.match(doc.body.textContent, /Back to Receebo/);
    assert.doesNotMatch(doc.body.textContent, /Did you forget/);
  });
}

for (const route of ["/us", "/search", "/search/worth-keeping", "/stats", "/scan", "/imports", "/settings", "/profile", "/profile/recurring", "/get-started", "/receipts/123", "/sign-in", "/sign-up/verify-email-address"]) {
  test(`${route}: client-only route is reachable but not indexable`, async () => {
    const response = await fetch(url + route);
    assert.equal(response.status, 200);
    const doc = new JSDOM(await response.text()).window.document;
    assert.equal(doc.querySelector('meta[name="robots"]').content, "noindex, follow");
    assert.equal(doc.querySelector('link[rel="canonical"]'), null);
    assert.equal(doc.querySelector("#root").textContent, "");
  });
}

test("query parameters retain public canonical and trailing slashes redirect", async () => {
  const response = await fetch(url + "/privacy?utm_source=test");
  assert.match(await response.text(), /rel="canonical" href="https:\/\/receebo.net\/privacy"/);
  const redirect = await fetch(url + "/terms/?utm_source=test", { redirect: "manual" });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "/terms?utm_source=test");
});

test("HEAD and public media byte ranges remain supported", async () => {
  const head = await fetch(url + "/privacy", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const response = await fetch(url + "/logo.svg", { headers: { Range: "bytes=0-19" } });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 20);
  assert.match(response.headers.get("content-type"), /image\/svg/);
  assert.equal((await fetch(url + "/logo.svg", { headers: { Range: "bytes=999999999-" } })).status, 416);
});

test("PWA precache includes each generated public page", async () => {
  const worker = await readFile(new URL("../dist/public/sw.js", import.meta.url), "utf8");
  for (const file of ["index.html", "privacy/index.html", "terms/index.html", "offline.html"]) {
    assert.ok(worker.includes(`"url":"${file}"`), `${file} missing from worker`);
  }
});
