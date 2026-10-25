import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve("generated-artifacts/receebo-marketing");
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
const sources = [
  ...manifest.screens.map(name => `sources/${name}.png`),
  ...Object.values(manifest.clips).map(clip => `sources/${clip.source}`),
  "sources/sample-receipt.png", "sources/fixtures.json", "sources/hero.png",
];
const exports = [
  ...Object.values(manifest.clips).map(clip => `web/${clip.file}`),
  ...Object.keys(manifest.clips).map(clip => `web/${clip}.webm`),
  ...manifest.screens.map(name => `web/${name}.webp`),
  "web/hero-600.webp", "web/hero-1200.webp",
];
manifest.sha256 = {};
for (const file of [...sources, ...exports]) {
  manifest.sha256[file] = createHash("sha256").update(await readFile(`${root}/${file}`)).digest("hex");
}
await writeFile(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
execFileSync("tar", ["-czf", `${root}/source-captures.tar.gz`, "-C", root, ...sources, "manifest.json"]);
console.log("Packaged only current captures and recorded source/export checksums.");
