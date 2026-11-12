import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { objectStorageClient, ObjectStorageService } from "../../../api-server/src/lib/objectStorage";

// Isolated release tooling: no API startup, database imports or v3 mutations.
export const markets = ["eu", "us", "br"] as const;
export const v4Prefix = "marketing/receebo-real-app/v4";
export const releaseFiles = [
  "library-phone.webp", "receipt-phone.webp", "protection.webp", "show-to-store.webp",
  ...["capture", "find", "protect"].flatMap(clip => [`${clip}.mp4`, `${clip}.webm`, `${clip}-poster.webp`]),
];
export const promoFiles = ["16x9", "9x16"].flatMap(ratio => [
  `receebo-promo-${ratio}.mp4`, `receebo-promo-${ratio}.webm`, `receebo-promo-${ratio}-poster.webp`,
]);
const types: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".webp": "image/webp" };
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const staging = path.join(repo, "generated-artifacts/marketing-v4");
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function storage() {
  const [bucket, ...directory] = new ObjectStorageService().getPublicObjectSearchPaths()[0].replace(/^\/+/, "").split("/");
  return (key: string) => objectStorageClient.bucket(bucket).file([...directory, key].filter(Boolean).join("/"));
}

function previewOrigin() {
  if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required; never target production.");
  const origin = new URL(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  if (!origin.hostname.endsWith(".replit.dev")) throw new Error("Only the DEV preview is permitted.");
  return origin.origin;
}

async function publicCheck(key: string) {
  const pathname = `/api/storage/public-objects/${key}`;
  const response = await fetch(`${previewOrigin()}${pathname}`, { signal: AbortSignal.timeout(120_000) });
  if (response.status !== 200) throw new Error(`${pathname}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { pathname, status: response.status, bytes: bytes.length, sha256: digest(bytes) };
}

async function protectedDisk() {
  const guard = JSON.parse(await readFile(path.join(repo, "artifacts/receiptr/scripts/marketing/published-media-guard.json"), "utf8"));
  const result: Record<string, string> = {};
  for (const [file, expected] of Object.entries(guard.files)) {
    result[file] = digest(await readFile(path.join(repo, file)));
    if (result[file] !== expected) throw new Error(`Protected published file differs: ${file}`);
  }
  return result;
}

async function upload() {
  await mkdir(staging, { recursive: true });
  const beforeDisk = await protectedDisk();
  // Read-only baseline: the script has no write branch for the v3 prefix.
  const v3Before = [];
  for (const name of releaseFiles) v3Before.push(await publicCheck(`marketing/receebo-real-app/v3/${name}`));
  await writeFile(path.join(staging, "v3-before.json"), JSON.stringify(v3Before, null, 2));
  const object = storage();
  const uploaded = [];
  for (const market of markets) {
    const destination = path.join(staging, market);
    await mkdir(destination, { recursive: true });
    for (const name of releaseFiles) {
      const source = path.join(repo, "artifacts/receiptr/public/_capture-tmp", market, "web", name);
      const copied = path.join(destination, name);
      await copyFile(source, copied); // Never move or modify the reviewed source.
      const bytes = await readFile(copied);
      const key = `${v4Prefix}/${market}/${name}`;
      const file = object(key);
      let disposition = "created";
      try {
        await file.save(bytes, {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: types[path.extname(name)],
            cacheControl: "public, max-age=86400",
            metadata: { "custom:aclPolicy": JSON.stringify({ owner: "marketing-assets", visibility: "public" }) },
          },
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 412) throw error;
        disposition = "skipped-existing";
      }
      const checked = await publicCheck(key);
      if (checked.sha256 !== digest(bytes)) throw new Error(`Existing v4 object differs; left untouched: ${key}`);
      uploaded.push({ ...checked, disposition });
      console.log(`${disposition} 200 ${checked.pathname} (${checked.bytes} bytes)`);
    }
  }
  const v3After = [];
  for (const name of releaseFiles) v3After.push(await publicCheck(`marketing/receebo-real-app/v3/${name}`));
  if (JSON.stringify(v3Before) !== JSON.stringify(v3After)) throw new Error("v3 public bytes changed during verification");
  if (JSON.stringify(beforeDisk) !== JSON.stringify(await protectedDisk())) throw new Error("Protected disk bytes changed");
  await writeFile(path.join(staging, "upload-report.json"), JSON.stringify({
    checkedAt: new Date().toISOString(), uploaded, v3: v3After, protectedDisk: beforeDisk,
  }, null, 2));
  console.log(`Verified ${uploaded.length} v4 objects, ${v3After.length} unchanged v3 objects, and protected disk files.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "upload") throw new Error("Usage: tsx scripts/marketing/upload-v4.ts upload");
  await upload();
}
