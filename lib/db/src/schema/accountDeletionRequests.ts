import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  userId: text("user_id").primaryKey(),
  stage: text("stage").notNull().default("requested"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
