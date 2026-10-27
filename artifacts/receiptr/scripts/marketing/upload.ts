import { readFile } from "node:fs/promises";
import path from "node:path";
import { objectStorageClient, ObjectStorageService } from "../../../api-server/src/lib/objectStorage";
// @ts-expect-error Local Node tooling module has no TypeScript declarations.
import { requireApprovedCapture } from "./freshness.mjs";

// Uses the app's existing sidecar-authenticated storage client. No credentials,
// signed URLs, or environment contents are logged or written to the manifest.
const prefix = "marketing/receebo-real-app/v2";
const approvedExports = await requireApprovedCapture();
const root = path.resolve("generated-artifacts/receebo-marketing");
const service = new ObjectStorageService();
const publicPath = service.getPublicObjectSearchPaths()[0];
const [bucket, ...parts] = publicPath.replace(/^\/+/, "").split("/");
const dir = parts.join("/");
const types: Record<string, string> = { ".webp": "image/webp", ".webm": "video/webm", ".mp4": "video/mp4", ".gz": "application/gzip", ".json": "application/json" };
// Upload exactly the reviewed files, not leftovers from older capture runs.
for (const local of Object.keys(approvedExports)) {
  const remote = path.basename(local);
  const file = objectStorageClient.bucket(bucket).file(`${dir}/${prefix}/${remote}`);
  await file.save(await readFile(`${root}/${local}`), {
    resumable: false,
    // Never overwrite images/videos already used by an existing release.
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType: types[path.extname(local)] ?? "application/octet-stream",
      cacheControl: "public, max-age=86400",
      metadata: { "custom:aclPolicy": JSON.stringify({ owner: "marketing-assets", visibility: "public" }) },
    },
  });
  console.log(`Uploaded ${remote}`);
}
