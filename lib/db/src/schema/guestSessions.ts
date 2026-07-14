import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const guestSessionsTable = pgTable("guest_sessions", {
  token: text("token").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GuestSession = typeof guestSessionsTable.$inferSelect;
