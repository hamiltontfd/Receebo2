import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One row per AI read (receipt extraction) done for a no-card trial account,
 * whether the result was saved or discarded. Capped per trial (see
 * api-server/src/lib/trialAiReads.ts). Deliberately kept when receipts are
 * deleted, so deleting never restores reads.
 */
export const trialAiReadsTable = pgTable("trial_ai_reads", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** "upload" | "email" */
  source: text("source").notNull(),
  /** Receipt id, object path or provider message id, for support/debugging. */
  ref: text("ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("trial_ai_reads_user_idx").on(table.userId)]);
