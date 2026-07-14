/**
 * One-off script to delete orphan files from object storage.
 *
 * An "orphan" is a file that exists in the storage bucket under the
 * PRIVATE_OBJECT_DIR/uploads/ prefix but has no matching receipt row in the DB.
 *
 * Usage (from the project root):
 *   node artifacts/api-server/scripts/cleanup-orphan-storage.mjs [--dry-run]
 *
 * Pass --dry-run to list orphans without deleting them.
 *
 * Environment variables required (same as the API server):
 *   PRIVATE_OBJECT_DIR  — e.g. /my-bucket/receipts
 *   DATABASE_URL        — PostgreSQL connection string
 */

import { Storage } from "@google-cloud/storage";
import postgres from "postgres";

const DRY_RUN = process.argv.includes("--dry-run");
const SIDECAR = "http://127.0.0.1:1106";

// ---------------------------------------------------------------------------
// Parse CLI / env
// ---------------------------------------------------------------------------
const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim();
if (!privateDir) {
  console.error("PRIVATE_OBJECT_DIR is not set");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GCS client (same sidecar auth as the API server)
// ---------------------------------------------------------------------------
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "/bucket/path/..." → { bucketName, prefix } */
function parseDir(dir) {
  const parts = dir.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  return { bucketName, prefix };
}

/** Convert a GCS object name back to the /objects/... path stored in the DB */
function objectNameToPath(objectName, privatePrefix) {
  // privatePrefix = "path/to/uploads" (no leading slash, no trailing slash)
  const uploadsPrefix = privatePrefix.replace(/\/$/, "") + "/uploads/";
  if (!objectName.startsWith(uploadsPrefix)) return null;
  const entityId = "uploads/" + objectName.slice(uploadsPrefix.length);
  return `/objects/${entityId}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const { bucketName, prefix: dirPrefix } = parseDir(privateDir);
const uploadsPrefix = dirPrefix ? `${dirPrefix}/uploads/` : "uploads/";

console.log(`Bucket : ${bucketName}`);
console.log(`Prefix : ${uploadsPrefix}`);
console.log(`Dry run: ${DRY_RUN}`);
console.log();

// 1. Collect all objectPaths stored in the DB
const sql = postgres(databaseUrl);
const rows = await sql`SELECT object_path FROM receipts`;
const knownPaths = new Set(rows.map((r) => r.object_path));
console.log(`Receipts in DB : ${knownPaths.size}`);

// 2. List all objects in storage under the uploads prefix
const bucket = storage.bucket(bucketName);
const [files] = await bucket.getFiles({ prefix: uploadsPrefix });
console.log(`Objects in storage : ${files.length}`);
console.log();

// 3. Find orphans and delete (or report)
let orphanCount = 0;
let errorCount = 0;

for (const file of files) {
  const objectPath = objectNameToPath(file.name, dirPrefix);
  if (objectPath === null) continue; // shouldn't happen given prefix filter

  if (!knownPaths.has(objectPath)) {
    orphanCount++;
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would delete orphan: ${file.name}  (${objectPath})`);
    } else {
      try {
        await file.delete();
        console.log(`Deleted orphan: ${file.name}  (${objectPath})`);
      } catch (err) {
        errorCount++;
        console.error(`Failed to delete ${file.name}: ${err.message}`);
      }
    }
  }
}

await sql.end();

console.log();
console.log(`Orphans found  : ${orphanCount}`);
if (!DRY_RUN) console.log(`Delete errors  : ${errorCount}`);
console.log("Done.");
