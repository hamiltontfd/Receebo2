import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userBillingTable = pgTable("user_billing", {
  userId: text("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialReminderSentAt: timestamp("trial_reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserBilling = typeof userBillingTable.$inferSelect;
