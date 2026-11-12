import { pgTable, text, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Lightweight per-user notification preferences.
 * Kept separate from user_billing so it can be written for any Clerk user
 * regardless of whether they have a Stripe subscription.
 */
export const userPreferencesTable = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  market: text("market", { enum: ["PT", "BR", "US"] }),
  /** Actual country, first detected after consent or manually corrected. Never an IP. */
  country: text("country"),
  /** Manual choice in Settings (null = automatic). Always wins. */
  language: text("language", { enum: ["en", "pt-PT", "pt-BR"] }),
  /**
   * Browser language the signed-in app reported after legal consent (resolved:
   * en / pt-PT / pt-BR, anything else en). Only written while `language` is
   * null; used for emails when there is no manual choice. Additive migration in
   * api-server lib/marketMigration.ts.
   */
  detectedLanguage: text("detected_language", { enum: ["en", "pt-PT", "pt-BR"] }),
  detectedLanguageAt: timestamp("detected_language_at", { withTimezone: true }),
  notificationsOptOut: boolean("notifications_opt_out").notNull().default(false),
  onboardingReceiptDone: boolean("onboarding_receipt_done").notNull().default(false),
  onboardingSearchDone: boolean("onboarding_search_done").notNull().default(false),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  onboardingDismissed: boolean("onboarding_dismissed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  check("user_preferences_country_check", sql`${table.country} IS NULL OR ${table.country} ~ '^[A-Z]{2}$'`),
]);

export type UserPreferences = typeof userPreferencesTable.$inferSelect;
