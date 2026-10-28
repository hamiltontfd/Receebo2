import { pool } from "@workspace/db";
import { backfillPurchaseTypes } from "../lib/purchaseTypeBackfill";

// Dry run unless --apply is passed. Runs through the scripts workspace's tsx toolchain.
const apply = process.argv.slice(2).includes("--apply");
try {
  process.stdout.write(JSON.stringify(await backfillPurchaseTypes({ apply }), null, 2) + "\n");
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Backfill failed\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
