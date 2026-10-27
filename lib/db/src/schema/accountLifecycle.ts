import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Frozen (paused) accounts: access ended without an active subscription.
 * Deleted 60 days after access ended (never sooner than 30 days after the
 * account was first seen frozen, so every account gets both warnings).
 * The row is removed when the user subscribes again (deletion cancelled).
 */
export const accountLifecycleTable = pgTable("account_lifecycle", {
  userId: text("user_id").primaryKey(),
  accessEndedAt: timestamp("access_ended_at", { withTimezone: true }).notNull(),
  deletionDueAt: timestamp("deletion_due_at", { withTimezone: true }).notNull(),
  warning30SentAt: timestamp("warning_30_sent_at", { withTimezone: true }),
  warning7SentAt: timestamp("warning_7_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
