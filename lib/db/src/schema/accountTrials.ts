import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

// Independent of Stripe: retained through cancellation and receipt deletion.
export const accountTrialsTable = pgTable("account_trials", {
  userId: text("user_id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  monthlyPriceId: text("monthly_price_id"),
  yearlyPriceId: text("yearly_price_id"),
});

export const trialUploadsTable = pgTable("trial_uploads", {
  objectPath: text("object_path").primaryKey(),
  userId: text("user_id").notNull(),
  state: text("state").notNull().default("reserved"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Deliberately no FK/cascade: deletion must not restore successful uses.
  receiptId: integer("receipt_id"),
});
