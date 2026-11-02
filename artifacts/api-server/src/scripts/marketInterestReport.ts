import { pool } from "@workspace/db";
import { marketInterestReport } from "../lib/marketInterest";

// Aggregate "I'm interested" counts per country (no per-person data exists).
try {
  process.stdout.write(JSON.stringify(await marketInterestReport(), null, 2) + "\n");
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Report failed\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
