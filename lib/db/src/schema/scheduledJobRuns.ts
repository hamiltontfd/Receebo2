import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Last start time of periodic jobs, so restarts/instances don't rerun them early. */
export const scheduledJobRunsTable = pgTable("scheduled_job_runs", {
  job: text("job").primaryKey(),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }).notNull(),
});
