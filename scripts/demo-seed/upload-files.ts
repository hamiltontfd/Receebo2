// Uploads the fictional demo receipt images to private App Storage and points
// the demo account's receipts at them, so "Open" / "Show to store" work.
//
//   scripts/node_modules/.bin/tsx scripts/demo-seed/upload-files.ts <clerk_user_id>
//
// Run from the workspace root, in the DEV workspace, after seed-demo.sql.
// Idempotent: existing objects are kept; only this user's four demo receipts
// (matched by original_file_name) are updated. Also repairs rows from the old
// seed that used the non-loadable "__seed__/demo-*.jpg" placeholder paths.
// Prints no secrets or signed URLs.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { objectStorageClient, ObjectStorageService } from "../../artifacts/api-server/src/lib/objectStorage";
import { pool } from "../../lib/db/src/index";

export const DEMO_FILES = [
  { file: "demo-casa-lumen.jpg", originalFileName: "demo_casa_lumen.jpg" },
  { file: "demo-casa-jardim.jpg", originalFileName: "demo_casa_jardim.jpg" },
  { file: "demo-mercado-verde.jpg", originalFileName: "demo_mercado_verde.jpg" },
  { file: "demo-atelier-norte.jpg", originalFileName: "demo_atelier_norte.jpg" },
];
// Same layout the SQL seed writes: /objects/demo-seed/<user id>/<file>.
export const demoObjectPath = (userId: string, file: string) => `/objects/demo-seed/${userId}/${file}`;

const userId = process.argv[2];
if (!userId || !/^user_[A-Za-z0-9]+$/.test(userId)) {
  console.error("Usage: tsx scripts/demo-seed/upload-files.ts <clerk_user_id>");
  process.exit(2);
}
if (process.env.REPLIT_DEPLOYMENT) {
  console.error("Refusing to run inside a deployment; this seeds the dev demo account only.");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const service = new ObjectStorageService();
let privateDir = service.getPrivateObjectDir();
if (!privateDir.endsWith("/")) privateDir += "/";
const [bucketName, ...rest] = privateDir.replace(/^\/+/, "").split("/");
const prefix = rest.join("/");
const bucket = objectStorageClient.bucket(bucketName);
try {
  for (const { file, originalFileName } of DEMO_FILES) {
    const objectPath = demoObjectPath(userId, file);
    const object = bucket.file(`${prefix}${objectPath.slice("/objects/".length)}`);
    const [exists] = await object.exists();
    if (!exists) {
      await object.save(await readFile(path.join(here, "receipts", file)), {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: "image/jpeg",
          metadata: { "custom:aclPolicy": JSON.stringify({ owner: userId, visibility: "private" }) },
        },
      });
    }
    const { rowCount } = await pool.query(
      `UPDATE receipts SET object_path = $1, content_type = 'image/jpeg'
        WHERE user_id = $2 AND original_file_name = $3
          AND (object_path = $1 OR object_path LIKE '\\_\\_seed\\_\\_/demo-%')`,
      [objectPath, userId, originalFileName],
    );
    console.log(`${file}: ${exists ? "already uploaded" : "uploaded"}, ${rowCount} receipt(s) point to it`);
  }
} finally {
  await pool.end();
}
