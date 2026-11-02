import { pool } from "@workspace/db";
import { landingEventReport } from "../lib/landingEvents";

// Aggregate landing counts per day, event, path and utm_content (no per-person data exists).
try {
  process.stdout.write(JSON.stringify(await landingEventReport(), null, 2) + "\n");
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Report failed\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
