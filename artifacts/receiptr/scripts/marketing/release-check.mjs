import { fork, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import {
  workspace, output, baseline, reportPath, fingerprint, changedFiles,
  readJson, saveJson, exportHashes,
} from "./freshness.mjs";

const args = process.argv.slice(2).filter(arg => arg !== "--");
const mode = args[0] || "check";
if (!["check", "status", "approve"].includes(mode) ||
    args.slice(1).some(arg => arg !== "--visual-approved") ||
    (mode !== "approve" && args.includes("--visual-approved"))) {
  throw new Error("Usage: release-check.mjs [check|status|approve --visual-approved]");
}
process.chdir(workspace);
const current = await fingerprint();
const approved = await readJson(baseline);
const changed = changedFiles(approved?.inputs || {}, current);
if (!approved?.visuallyApproved) console.log("MEDIA REVIEW REQUIRED: no visually approved baseline exists yet.");
if (changed.length) console.log(`Marketing media inputs changed (${changed.length}):\n${changed.map(file => `  ${file}`).join("\n")}`);
console.log("Public assets are never uploaded or replaced by this command.");

if (mode === "status") {
  process.exitCode = approved?.visuallyApproved && !changed.length ? 0 : 1;
} else if (mode === "approve") {
  if (!args.includes("--visual-approved")) throw new Error("Inspect every still and watch all clips first; approval requires --visual-approved.");
  const report = await readJson(reportPath);
  if (!report?.capturePassed || changedFiles(report.inputs, current).length) {
    throw new Error("No successful capture for the current sources. Run marketing:check first.");
  }
  const exports = await exportHashes();
  if (changedFiles(report.exports, exports).length) throw new Error("Exports changed since the check. Rerun marketing:check and review again.");
  await saveJson(baseline, { schemaVersion: 1, visuallyApproved: true, approvedAt: new Date().toISOString(), inputs: current, exports });
  console.log("Visual approval recorded locally. Commit approved-media.json with the reviewed source changes. Uploading a NEW version remains a separate, manual step.");
} else {
  await mkdir(output, { recursive: true });
  const lock = path.join(output, ".release-check-lock");
  await mkdir(lock); // Fail rather than mix concurrent captures.
  let server;
  try {
    await rm(reportPath, { force: true }); // A failed run must invalidate old evidence.
    // No API keys, account sessions, VITE_* keys, or service configuration reach
    // the isolated server/recorder. Only runtime/browser locations are inherited.
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "XDG_CACHE_HOME", "CHROMIUM_PATH", "PLAYWRIGHT_MODULE", "PLAYWRIGHT_BROWSERS_PATH"]
      .filter(key => process.env[key]).map(key => [key, process.env[key]]));
    server = fork(new URL("./capture-server.mjs", import.meta.url), [], { cwd: workspace, env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Isolated capture server did not start within 30 seconds.")), 30000);
      server.once("message", message => { clearTimeout(timer); message === "ready" ? resolve() : reject(new Error("Unexpected server response")); });
      server.once("error", error => { clearTimeout(timer); reject(error); });
      server.once("exit", code => { clearTimeout(timer); reject(new Error(`Capture server exited (${code}); port 5199 must be free.`)); });
    });
    for (const script of ["record.mjs", "package.mjs"]) {
      const child = spawn(process.execPath, [new URL(script, import.meta.url).pathname], { cwd: workspace, env, stdio: "inherit" });
      const timer = setTimeout(() => child.kill("SIGKILL"), 300000);
      try {
        const [code] = await once(child, "exit");
        if (code !== 0) throw new Error(`${script} failed (${code}); no approval was recorded.`);
      } finally { clearTimeout(timer); }
    }
    if (changedFiles(current, await fingerprint()).length) throw new Error("Sources changed during capture. Rerun the check.");
    await saveJson(reportPath, { capturePassed: true, checkedAt: new Date().toISOString(), inputs: current, exports: await exportHashes() });
    console.log(`Capture passed with fictional fixtures and no unexpected requests. Review exports in ${output}/web.`);
    if (!approved?.visuallyApproved || changed.length) {
      console.error("MEDIA REVIEW REQUIRED: inspect all stills and all three clips in BOTH formats before running marketing:approve --visual-approved. See docs/receebo-marketing-media.md.");
      process.exitCode = 1;
    } else console.log("Marketing inputs match the visually approved baseline. No public assets were changed.");
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    }
    await rm(lock, { recursive: true, force: true });
  }
}
