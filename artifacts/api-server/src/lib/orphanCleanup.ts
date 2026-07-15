import type { File as GCSFile } from "@google-cloud/storage";
import { db, receiptsTable } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const ORPHAN_AGE_THRESHOLD_DAYS = 7;
const ORPHAN_AGE_THRESHOLD_MS = ORPHAN_AGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/** Parse "/bucket/path/..." → { bucketName, dirPrefix } */
function parsePrivateDir(dir: string): { bucketName: string; dirPrefix: string } {
  const parts = dir.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const dirPrefix = parts.slice(1).join("/");
  return { bucketName, dirPrefix };
}

/** Convert a GCS object name back to the /objects/... path stored in the DB */
function objectNameToPath(objectName: string, dirPrefix: string): string | null {
  const uploadsPrefix = (dirPrefix ? dirPrefix.replace(/\/$/, "") + "/" : "") + "uploads/";
  if (!objectName.startsWith(uploadsPrefix)) return null;
  const entityId = "uploads/" + objectName.slice(uploadsPrefix.length);
  return `/objects/${entityId}`;
}

async function runOrphanCleanup(): Promise<void> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!privateDir) {
    logger.warn("PRIVATE_OBJECT_DIR not set — skipping orphan cleanup");
    return;
  }

  const { bucketName, dirPrefix } = parsePrivateDir(privateDir);
  const uploadsPrefix = (dirPrefix ? dirPrefix.replace(/\/$/, "") + "/" : "") + "uploads/";

  logger.info({ bucketName, uploadsPrefix }, "Orphan cleanup starting");

  let knownPaths: Set<string>;
  try {
    const rows = await db.select({ objectPath: receiptsTable.objectPath }).from(receiptsTable);
    knownPaths = new Set(rows.map((r) => r.objectPath));
    logger.info({ count: knownPaths.size }, "Loaded known object paths from DB");
  } catch (err) {
    logger.error({ err }, "Orphan cleanup: failed to query DB, aborting");
    return;
  }

  const bucket = objectStorageClient.bucket(bucketName);
  let files: GCSFile[];
  try {
    [files] = await bucket.getFiles({ prefix: uploadsPrefix });
    logger.info({ count: files.length }, "Listed storage objects under uploads prefix");
  } catch (err) {
    logger.error({ err }, "Orphan cleanup: failed to list storage objects, aborting");
    return;
  }

  const cutoffTime = Date.now() - ORPHAN_AGE_THRESHOLD_MS;

  let orphansDeleted = 0;
  let orphansSkippedTooNew = 0;
  let deleteErrors = 0;

  for (const file of files) {
    const objectPath = objectNameToPath(file.name, dirPrefix);
    if (objectPath === null) continue;

    if (knownPaths.has(objectPath)) continue;

    const timeCreated = file.metadata?.timeCreated as string | undefined;
    if (!timeCreated) {
      logger.warn({ objectName: file.name }, "Orphan cleanup: file has no timeCreated metadata, skipping");
      continue;
    }

    const createdAt = new Date(timeCreated).getTime();
    if (isNaN(createdAt) || createdAt > cutoffTime) {
      orphansSkippedTooNew++;
      continue;
    }

    try {
      await file.delete();
      logger.info(
        { objectName: file.name, objectPath, ageMs: Date.now() - createdAt },
        "Orphan cleanup: deleted orphaned storage file",
      );
      orphansDeleted++;
    } catch (err) {
      deleteErrors++;
      logger.error({ err, objectName: file.name }, "Orphan cleanup: failed to delete file");
    }
  }

  logger.info(
    {
      orphansDeleted,
      orphansSkippedTooNew,
      deleteErrors,
      thresholdDays: ORPHAN_AGE_THRESHOLD_DAYS,
    },
    "Orphan cleanup complete",
  );
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startOrphanCleanupScheduler(): void {
  if (cleanupTimer) return;

  void runOrphanCleanup();

  cleanupTimer = setInterval(() => {
    void runOrphanCleanup();
  }, CLEANUP_INTERVAL_MS);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  logger.info(
    { intervalMs: CLEANUP_INTERVAL_MS, thresholdDays: ORPHAN_AGE_THRESHOLD_DAYS },
    "Orphan cleanup scheduler started",
  );
}

export function stopOrphanCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
