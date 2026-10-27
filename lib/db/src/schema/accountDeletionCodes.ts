import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One pending account-deletion code per user (6 digits, emailed). Only a
 * keyed hash is stored. Single use, 15-minute expiry, 5 attempts. The send
 * counters rate-limit how often a code can be emailed.
 */
export const accountDeletionCodesTable = pgTable("account_deletion_codes", {
  userId: text("user_id").primaryKey(),
  codeHash: text("code_hash"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
  sendWindowStartedAt: timestamp("send_window_started_at", { withTimezone: true }).notNull(),
  sendsInWindow: integer("sends_in_window").notNull().default(0),
});
