import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Lightweight per-user notification preferences.
 * Kept separate from user_billing so it can be written for any Clerk user
 * regardless of whether they have a Stripe subscription.
 */
export const userPreferencesTable = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  notificationsOptOut: boolean("notifications_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserPreferences = typeof userPreferencesTable.$inferSelect;
