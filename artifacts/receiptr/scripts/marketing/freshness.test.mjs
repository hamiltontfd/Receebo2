import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { changedFiles, fingerprint, validateApproval, exportHashes, workspace } from "./freshness.mjs";
import { isolate, receipts, createCaptureSession, activeCapture } from "./fixtures.mjs";
import { illustrativePdf, sampleDocumentLines, sampleDocumentHtml, moneyLabel } from "./sample-document.mjs";
import { captureLabels, captureLocators } from "./locators.mjs";

test("detects added, edited, and deleted media inputs", () => {
  assert.deepEqual(changedFiles({ deleted: "a", edited: "a", stable: "a" }, { added: "b", edited: "b", stable: "a" }),
    ["added", "deleted", "edited"]);
});

test("approval requires current successful capture and exactly the reviewed exports", () => {
  const inputs = { page: "a" }, exports = { hero: "b" };
  const approved = { visuallyApproved: true, inputs, exports };
  const report = { capturePassed: true, inputs, exports };
  assert.doesNotThrow(() => validateApproval(approved, report, inputs, exports));
  for (const [a, r, i, e] of [
    [null, report, inputs, exports],
    [{ ...approved, visuallyApproved: false }, report, inputs, exports],
    [approved, null, inputs, exports],
    [approved, { ...report, capturePassed: false }, inputs, exports],
    [approved, report, { page: "changed" }, exports],
    [approved, { ...report, inputs: {} }, inputs, exports],
    [approved, report, inputs, { hero: "replaced" }],
    [approved, { ...report, exports: {} }, inputs, exports],
  ]) assert.throws(() => validateApproval(a, r, i, e), /visual approval/);
});

test("fingerprint covers pages, fixtures, styles, public assets, and shared contracts without approval recursion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-inputs-"));
  const files = [
    "artifacts/receiptr/src/pages/search.tsx", "artifacts/receiptr/src/index.css",
    "artifacts/receiptr/src/pages/search.test.tsx", "artifacts/receiptr/public/font.woff",
    "artifacts/receiptr/scripts/marketing/fixtures.mjs",
    "artifacts/receiptr/scripts/marketing/approved-media.json",
    "artifacts/receiptr/package.json", "lib/api-client-react/src/index.ts",
    "lib/object-storage-web/src/index.ts", "pnpm-lock.yaml",
  ];
  try {
    for (const name of files) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), "original");
    }
    const before = await fingerprint(root);
    for (const name of files) await writeFile(path.join(root, name), "changed");
    const changed = changedFiles(before, await fingerprint(root));
    assert.deepEqual(changed, files.filter(name => !name.endsWith(".test.tsx") && !name.endsWith("approved-media.json")).sort());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("incomplete or failed captures cannot be approved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-exports-"));
  try {
    await assert.rejects(exportHashes(root), /isolation/);
    for (const manifest of [
      { sampleData: true, errors: ["broken page"], unexpected: [] },
      { sampleData: true, errors: [], unexpected: ["POST external request"] },
      { sampleData: true, errors: [], unexpected: [], screens: [], clips: {} },
    ]) {
      await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
      await assert.rejects(exportHashes(root), /isolation|incomplete/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("fixture requests never reach account services; unknown calls fail closed", async () => {
  let handler;
  const context = {
    addInitScript: async () => {},
    route: async (_, callback) => { handler = callback; },
  };
  const unexpected = await isolate(context, "/fictional/sample.png");
  async function request(url, method = "GET", body = {}) {
    let result;
    await handler({
      request: () => ({ url: () => url, method: () => method, postDataJSON: () => body }),
      fulfill: async data => { result = { action: "fulfilled", ...data }; },
      abort: async () => { result = { action: "blocked" }; },
      continue: async () => { result = { action: "continued" }; },
    });
    return result;
  }
  const origin = "http://127.0.0.1:5199";
  assert.equal((await request(`${origin}/api/receipts`)).json.items.length, receipts.length);
  assert.equal((await request(`${origin}/api/storage/uploads/request-url`, "POST")).json.uploadURL, `${origin}/api/capture-upload`);
  assert.equal((await request(`${origin}/api/capture-upload`, "PUT")).status, 200);
  assert.equal((await request(`${origin}/api/receipts`, "POST")).json.id, receipts[0].id);
  assert.equal((await request(`${origin}/api/receipts/${receipts[0].id}`, "PATCH", { merchant: "Fictional" })).json.merchant, "Fictional");
  assert.deepEqual((await request(`${origin}/api/mail/status`)).json.providers, []);
  for (const endpoint of ["/api/billing/checkout", "/api/gmail/connect", "/api/unmapped"]) {
    assert.equal((await request(`${origin}${endpoint}`, "POST")).status, 403);
  }
  assert.equal((await request("https://real-service.invalid/api/receipts")).action, "blocked");
  assert.equal((await request("https://fonts.googleapis.com/css2?family=Inter")).action, "continued");
  assert.equal((await request("https://fonts.googleapis.com/css2", "POST")).action, "blocked");
  assert.equal(unexpected.length, 5);
  const session = createCaptureSession();
  assert.equal(session.answer("GET", `${origin}/api/account/market`).fulfill.json.market, "PT");
  assert.equal(session.answer("GET", `${origin}/api/account/language`).fulfill.json.language, "pt-PT");
  assert.equal(session.answer("GET", `${origin}/api/account/onboarding`).fulfill.json.dismissed, true);
  assert.equal(session.answer("GET", `${origin}/api/receipts`).fulfill.json.items.length, 4);
});

test("all markets record all clips by default; explicit CAPTURE_CLIPS=0 skips video", async () => {
  const { clipsEnabled } = await import("./record.mjs");
  assert.equal(clipsEnabled(false, undefined), true);
  assert.equal(clipsEnabled(false, "1"), true);
  assert.equal(clipsEnabled(false, "0"), false);
  assert.equal(clipsEnabled(true, undefined), true);
  assert.equal(clipsEnabled(true, "1"), true);
  assert.equal(clipsEnabled(true, "0"), false);
});

test("partial recapture selects only review and Capture while preserving the full default", async () => {
  const { capturePlan } = await import("./record.mjs");
  assert.deepEqual(capturePlan("", "1"), { partial: false, review: true, clips: ["capture", "find", "protect"] });
  assert.deepEqual(capturePlan("", "0"), { partial: false, review: true, clips: [] });
  assert.deepEqual(capturePlan("review,capture", "1"), { partial: true, review: true, clips: ["capture"] });
  assert.deepEqual(capturePlan(" capture, review,review ", "1"), { partial: true, review: true, clips: ["capture"] });
  assert.deepEqual(capturePlan("review", "0"), { partial: true, review: true, clips: [] });
  assert.deepEqual(capturePlan("capture", "1"), { partial: true, review: false, clips: ["capture"] });
  for (const value of ["unknown", "find", "review,", "review,protect"]) {
    assert.throws(() => capturePlan(value, "1"), /CAPTURE_ONLY/);
  }
  assert.throws(() => capturePlan("capture", "0"), /CAPTURE_CLIPS=0/);
});

test("Capture holds the visible TOTAL before its poster and the scroll to Save", async () => {
  const { reviewHoldMs } = await import("./record.mjs");
  assert.ok(reviewHoldMs >= 3000);
  const record = await readFile(new URL("./record.mjs", import.meta.url), "utf8");
  assert.match(record, /manifest\.reviewTotals\.capture = await reviewTotal\(c\);\s*await c\.page\.waitForTimeout\(reviewHoldMs\);\s*await still\(c\.page, "capture-poster"\);\s*await ui\.save\.scrollIntoViewIfNeeded\(\)/);
  assert.match(record, /Review TOTAL must be fully visible/);
  assert.match(record, /manifest\$\{plan\.partial \? "\.partial" : ""\}\.json/);
  assert.match(record, /if \(plan\.partial && name !== "review"\) continue/);
  assert.match(record, /if \(!plan\.partial\) await still\(phone\.page, "scan-upload"\)/);
});

test("capture contexts stay separate and the published binaries stay put", async () => {
  const record = await readFile(new URL("./record.mjs", import.meta.url), "utf8");
  assert.match(record, /captureLocators/);
  assert.match(record, /section-warranty/);
  assert.match(record, /scan-upload/);
  assert.match(record, /receipt-warranty/);
  assert.match(record, /data-capture-pointer/);
  assert.match(record, /if \(!showPointer\) return/);
  assert.match(record, /centerYAtDpr3/);
  assert.match(record, /failure\.png/);
  const captureUi = await readFile(new URL("./capture.tsx", import.meta.url), "utf8");
  assert.match(captureUi, /OnboardingProvider/);
  assert.match(captureUi, /LanguageProvider/);
  assert.doesNotMatch(record, /name: "Show to store"/);
  assert.doesNotMatch(record, /Consumer Rights · Portugal/);
  const vite = await readFile(new URL("./vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /127\.0\.0\.1/);
  assert.match(vite, /5199/);
  const appVite = await readFile(path.join(workspace, "artifacts/receiptr/vite.config.ts"), "utf8");
  assert.doesNotMatch(appVite, /scripts\/marketing\/capture/);
  const replit = await readFile(path.join(workspace, ".replit"), "utf8");
  assert.doesNotMatch(replit, /5199/);
  assert.match(captureUi, /captureLabels/);
  assert.equal(captureLabels.en.disclosure, "Sample data · fictional purchases · simulated extraction");
  const guard = JSON.parse(await readFile(new URL("./published-media-guard.json", import.meta.url), "utf8"));
  for (const [file, expected] of Object.entries(guard.files)) {
    const hash = createHash("sha256").update(await readFile(path.join(workspace, file))).digest("hex");
    assert.equal(hash, expected, file);
  }
  const pdf = illustrativePdf(sampleDocumentLines(receipts[0]));
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /Casa Lumen Eletr/);
});

test("each context returns its own language, market, frozen clock, output and 2x phone size", () => {
  const origin = "http://127.0.0.1:5199";
  const outputs = new Set();
  for (const [name, market, language, locale, currency, zone] of [
    ["eu", "PT", "pt-PT", "pt-PT", "EUR", "Europe/Lisbon"],
    ["us", "US", "en", "en-US", "USD", "UTC"],
    ["br", "BR", "pt-BR", "pt-BR", "BRL", "America/Sao_Paulo"],
  ]) {
    const capture = activeCapture(name);
    const session = createCaptureSession(capture);
    assert.deepEqual(session.answer("GET", `${origin}/api/account/market`).fulfill.json, { market, country: market });
    assert.deepEqual(session.answer("GET", `${origin}/api/account/language`).fulfill.json, { language });
    assert.equal(capture.locale, locale);
    assert.equal(capture.timezoneId, zone);
    assert.ok(Number.isFinite(Date.parse(capture.capturedAt)));
    assert.deepEqual(capture.phone, { width: 390, height: 844, deviceScaleFactor: 2 });
    assert.ok(capture.receipts.every(r => r.currency === currency && r.purchaseCountry === market && r.itemRights.length === r.products.length));
    outputs.add(capture.output);
    assert.ok(session.answer("POST", "https://receebo.net/api/receipts").abort);
    assert.equal(session.answer("POST", `${origin}/api/billing/checkout`).fulfill.status, 403);
    const lines = sampleDocumentLines(capture.receipts[0], language);
    assert.match(lines[0], language === "en" ? /FICTIONAL SAMPLE/ : /EXEMPLO FICTÍCIO/);
    assert.ok(lines.includes(`Total ${moneyLabel(capture.receipts[0], capture.receipts[0].total, language)}`));
    assert.match(sampleDocumentHtml(lines, language), new RegExp(`lang="${language}"`));
    if (name === "br") {
      assert.ok(lines.some(line => line.includes("R$")));
      assert.ok(lines.some(line => line.includes(capture.receipts[0].deliveryDate)));
      // Sample receipt is not a newly authored legal policy.
      assert.ok(!lines.some(line => /CDC|art\.?\s*49|art\.?\s*26/.test(line)));
      assert.ok(!lines.some(line => /€|\$\d/.test(line)));
    }
  }
  assert.equal(outputs.size, 3);
  assert.equal(activeCapture("pt"), activeCapture("eu"));
  assert.throws(() => activeCapture("unknown"), /CAPTURE_CONTEXT/);
});

test("localized locators use real save/search labels and testid for the original", () => {
  const calls = [];
  const locator = { locator: value => { calls.push(["locator", value]); return locator; } };
  const page = {
    getByRole: (role, options) => { calls.push(["role", role, options]); return locator; },
    getByPlaceholder: (value, options) => { calls.push(["placeholder", value, options]); return locator; },
    getByTestId: value => { calls.push(["testid", value]); return locator; },
    locator: value => { calls.push(["css", value]); return locator; },
  };
  for (const language of ["en", "pt-PT", "pt-BR"]) {
    calls.length = 0;
    captureLocators(page, language);
    assert.deepEqual(calls[0], ["role", "button", { name: captureLabels[language].save, exact: true }]);
    assert.deepEqual(calls[1], ["placeholder", captureLabels[language].search, { exact: true }]);
    assert.deepEqual(calls[2], ["testid", "button-view-original"]);
    assert.deepEqual(calls[3], ["css", `[aria-label=${JSON.stringify(captureLabels[language].dismissOriginal)}]`]);
    assert.deepEqual(calls[4], ["locator", "img"]);
    assert.equal(calls.filter(call => call[0] === "role").length, 1, "Only Save uses role, never the fullscreen overlay");
  }
});

test("show-to-store wait uses the standard failure dump before decoding", async () => {
  const record = await readFile(new URL("./record.mjs", import.meta.url), "utf8");
  assert.match(record, /await requireVisible\(phone\.page, phoneUi\.originalImage, "show-to-store image", phone\.unexpected\);\s*await phoneUi\.originalImage\.evaluate\(img => img\.decode\(\)\)/);
  assert.match(record, /sources\/failure\.png/);
  assert.match(record, /sources\/failure\.json/);
});

test("every market has the same six hero scenes and shared capture dimensions", async () => {
  const { captureSizes, heroScenes } = await import("./record.mjs");
  assert.deepEqual(captureSizes.phone, { width: 390, height: 844, deviceScaleFactor: 2 });
  assert.deepEqual(captureSizes.desktop, { width: 1440, height: 900, deviceScaleFactor: 2 });
  assert.deepEqual(captureSizes.clip, { width: 960, height: 640, deviceScaleFactor: 1 });
  assert.deepEqual(Object.keys(heroScenes), ["home", "upload", "review", "detail", "warranty", "home-desktop"]);
  const record = await readFile(new URL("./record.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(record, /1170|2532|CAPTURE_DESKTOP/);
  assert.match(record, /\[2880, 1800\].*\[780, 1688\]/);
});

test("CAPTURE_CONTEXT=us selects the dollar collection without Portugal rules", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    process.env.CAPTURE_CONTEXT = "us";
    const { activeCapture, createCaptureSession } = await import(${JSON.stringify(new URL("./fixtures.mjs", import.meta.url).href)});
    const capture = activeCapture();
    if (capture.name !== "us" || capture.receipts.length !== 5 || capture.receipts[0].currency !== "USD") process.exit(1);
    const market = createCaptureSession().answer("GET", "http://127.0.0.1:5199/api/account/market");
    if (market.fulfill.json.market !== "US") process.exit(2);
    if (JSON.stringify(capture.receipts).includes("PT:DL")) process.exit(3);
  `], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("CLI rejects unreviewed/missing/stale evidence and accepts explicit review only in a disposable workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-cli-"));
  const scripts = path.join(root, "artifacts/receiptr/scripts/marketing");
  const out = path.join(root, "generated-artifacts/receebo-marketing");
  const reportPath = path.join(out, "freshness-report.json");
  const save = (file, data) => writeFile(file, JSON.stringify(data));
  try {
    for (const dir of [scripts, `${root}/artifacts/receiptr/src`, `${root}/artifacts/receiptr/public`,
      `${root}/lib/api-client-react/src`, `${root}/lib/object-storage-web/src`, `${out}/web`]) {
      await mkdir(dir, { recursive: true });
    }
    for (const file of ["freshness.mjs", "release-check.mjs"]) {
      await copyFile(new URL(file, import.meta.url), path.join(scripts, file));
    }
    await writeFile(`${root}/artifacts/receiptr/package.json`, '{"type":"module"}');
    await writeFile(`${root}/pnpm-lock.yaml`, "synthetic test");
    const cli = (...args) => spawnSync(process.execPath, [path.join(scripts, "release-check.mjs"), ...args], { encoding: "utf8" });
    assert.equal(cli("status").status, 1);
    assert.match(cli("approve").stderr, /requires --visual-approved/);
    assert.match(cli("approve", "--visual-approved").stderr, /No successful capture/);
    const screens = ["library-desktop", "receipt-desktop", "protection", "show-to-store",
      "library-phone", "receipt-phone", "capture-poster", "find-poster", "protect-poster"];
    const clips = { capture: {}, find: {}, protect: {} };
    await save(`${out}/manifest.json`, { sampleData: true, errors: [], unexpected: [], screens, clips });
    for (const name of [
      ...screens.map(name => `web/${name}.webp`),
      ...Object.keys(clips).flatMap(name => [`web/${name}.mp4`, `web/${name}.webm`]),
      "source-captures.tar.gz",
    ]) await writeFile(`${out}/${name}`, "synthetic unit-test evidence, not actual media");
    const report = { capturePassed: true, inputs: await fingerprint(root), exports: await exportHashes(out) };
    await save(reportPath, report);
    assert.equal(cli("approve", "--visual-approved").status, 0);
    assert.equal(cli("status").status, 0);
    await writeFile(`${out}/web/library-phone.webp`, "modified after capture");
    assert.match(cli("approve", "--visual-approved").stderr, /Exports changed/);
    await writeFile(`${root}/artifacts/receiptr/src/changed-page.tsx`, "UI changed");
    const stale = cli("status");
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /changed-page.tsx/);
    assert.match(cli("approve", "--visual-approved").stderr, /No successful capture/);
    await save(reportPath, { ...report, capturePassed: false });
    assert.match(cli("approve", "--visual-approved").stderr, /No successful capture/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
