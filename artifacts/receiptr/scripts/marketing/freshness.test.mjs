import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { changedFiles, fingerprint, validateApproval, exportHashes } from "./freshness.mjs";
import { isolate, receipts } from "./fixtures.mjs";

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
    const screens = ["library-desktop", "receipt-desktop", "protection", "original-receipt",
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
