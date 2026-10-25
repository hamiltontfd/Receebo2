import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { objectStorageClient, ObjectStorageService } from "../../../api-server/src/lib/objectStorage";

// Uses the app's existing sidecar-authenticated storage client. No credentials,
// signed URLs, or environment contents are logged or written to the manifest.
const prefix = "marketing/receebo-real-app/v1";
const root = path.resolve("generated-artifacts/receebo-marketing");
const service = new ObjectStorageService();
const publicPath = service.getPublicObjectSearchPaths()[0];
const [bucket, ...parts] = publicPath.replace(/^\/+/, "").split("/");
const dir = parts.join("/");
const types: Record<string, string> = { ".webp": "image/webp", ".webm": "video/webm", ".mp4": "video/mp4", ".gz": "application/gzip", ".json": "application/json" };
for (const [local, remote] of [
  ...((await readdir(`${root}/web`)).map(name => [`web/${name}`, name])),
  ["source-captures.tar.gz", "source-captures.tar.gz"],
  ["manifest.json", "manifest.json"],
]) {
  const file = objectStorageClient.bucket(bucket).file(`${dir}/${prefix}/${remote}`);
  await file.save(await readFile(`${root}/${local}`), {
    resumable: false,
    metadata: {
      contentType: types[path.extname(local)] ?? "application/octet-stream",
      cacheControl: "public, max-age=86400",
      metadata: { "custom:aclPolicy": JSON.stringify({ owner: "marketing-assets", visibility: "public" }) },
    },
  });
  console.log(`Uploaded ${remote}`);
}
