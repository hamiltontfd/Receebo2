import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const output = path.join(workspace, "generated-artifacts/receebo-marketing");
export const baseline = path.join(workspace, "artifacts/receiptr/scripts/marketing/approved-media.json");
export const reportPath = path.join(output, "freshness-report.json");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

// Deliberately conservative: shared components, styles, API contracts, fonts,
// dependencies, and capture tooling can all change the exported product UI.
const inputs = [
  "artifacts/receiptr/src", "artifacts/receiptr/public",
  "artifacts/receiptr/scripts/marketing", "artifacts/receiptr/package.json",
  "lib/api-client-react/src", "lib/object-storage-web/src",
  "pnpm-lock.yaml",
];

export async function fingerprint(root = workspace) {
  const files = {};
  async function visit(relative) {
    if (relative.endsWith("/approved-media.json") || /\.(test|spec)\.[^.]+$/.test(relative)) return;
    const absolute = path.join(root, relative);
    const entries = await readdir(absolute, { withFileTypes: true }).catch(error => {
      if (error.code === "ENOTDIR") return null;
      throw error;
    });
    if (entries) {
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed in capture inputs: ${relative}/${entry.name}`);
        await visit(`${relative}/${entry.name}`);
      }
    } else files[relative] = digest(await readFile(absolute));
  }
  for (const input of inputs) await visit(input);
  return files;
}

export function changedFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(file => before[file] !== after[file]).sort();
}

export async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function saveJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

export async function exportHashes(root = output) {
  const manifest = await readJson(path.join(root, "manifest.json"));
  if (!manifest || manifest.sampleData !== true || !Array.isArray(manifest.errors) ||
      !Array.isArray(manifest.unexpected) || manifest.errors.length || manifest.unexpected.length) {
    throw new Error("Capture failed isolation/browser checks; inspect manifest.json.");
  }
  const screens = [
    "library-desktop", "receipt-desktop", "protection", "original-receipt",
    "library-phone", "receipt-phone",
    "capture-poster", "find-poster", "protect-poster",
  ];
  if (JSON.stringify([...manifest.screens].sort()) !== JSON.stringify(screens.sort()) ||
      JSON.stringify(Object.keys(manifest.clips).sort()) !== JSON.stringify(["capture", "find", "protect"])) {
    throw new Error("Capture is incomplete; all nine stills and three interactions are required.");
  }
  const names = [
    ...screens.map(name => `web/${name}.webp`),
    ...["capture", "find", "protect"].flatMap(name => [`web/${name}.mp4`, `web/${name}.webm`]),
    "source-captures.tar.gz", "manifest.json",
  ];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, digest(await readFile(path.join(root, name)))])));
}

export async function requireApprovedCapture() {
  const [approved, report, current] = await Promise.all([
    readJson(baseline), readJson(reportPath), fingerprint(),
  ]);
  validateApproval(approved, report, current, await exportHashes());
  return approved.exports;
}

export function validateApproval(approved, report, current, exports) {
  if (!approved?.visuallyApproved || !report?.capturePassed ||
      !approved.inputs || !report.inputs || !approved.exports || !report.exports ||
      changedFiles(approved.inputs, current).length ||
      changedFiles(report.inputs, current).length ||
      changedFiles(approved.exports, exports).length ||
      changedFiles(approved.exports, report.exports).length) {
    throw new Error("Marketing media needs visual approval. Run marketing:check, inspect every export, then marketing:approve --visual-approved. See docs/receebo-marketing-media.md.");
  }
}
