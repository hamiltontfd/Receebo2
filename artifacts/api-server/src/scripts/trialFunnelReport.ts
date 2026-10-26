import { pool } from "@workspace/db";
import { trialFunnelReport } from "../lib/trialFunnelReport";

// Run through the existing scripts workspace's tsx toolchain.
const [from, to] = process.argv.slice(2);
try {
  if (!from || !to) throw new Error("Usage: report:trial-funnel <from-ISO> <to-exclusive-ISO>");
  process.stdout.write(JSON.stringify(await trialFunnelReport(new Date(from), new Date(to)), null, 2) + "\n");
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Report failed\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
