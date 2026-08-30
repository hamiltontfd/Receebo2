import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const legalAcceptancesTable = pgTable("legal_acceptances", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  termsVersion: text("terms_version").notNull(),
  privacyVersion: text("privacy_version").notNull(),
  confirmedAge: boolean("confirmed_age").notNull().default(true),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LegalAcceptance = typeof legalAcceptancesTable.$inferSelect;