import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const actionRateLimitsTable = pgTable("action_rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("action_rate_limits_expiry_idx").on(table.expiresAt)]);
