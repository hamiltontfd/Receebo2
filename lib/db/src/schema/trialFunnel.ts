import { pgTable, text, timestamp, uuid, primaryKey, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Identity mapping is separate from the content-free event stream and erased
// with the account. Never export this mapping in analytics reports.
export const trialFunnelSubjectsTable = pgTable("trial_funnel_subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
});

export const trialFunnelEventsTable = pgTable("trial_funnel_events", {
  subjectId: uuid("subject_id").notNull().references(() => trialFunnelSubjectsTable.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  dimension: text("dimension").notNull().default("none"),
  interval: text("interval"),
  reason: text("reason"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ name: "trial_funnel_events_pkey", columns: [t.subjectId, t.event, t.dimension] }),
  index("trial_funnel_events_time").on(t.occurredAt),
  check("trial_funnel_events_event_check", sql`${t.event} IN ('consent_accepted','account_trial_started',
    'first_receipt_succeeded','third_receipt_succeeded','paywall_viewed',
    'plan_selected','checkout_canceled','paid_activation_confirmed')`),
  check("trial_funnel_events_interval_check", sql`${t.interval} IN ('monthly','yearly')`),
  check("trial_funnel_events_reason_check", sql`${t.reason} IN ('trial_expired','trial_exhausted')`),
]);

export const trialFunnelCheckoutsTable = pgTable("trial_funnel_checkouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull().references(() => trialFunnelSubjectsTable.id, { onDelete: "cascade" }),
  interval: text("interval").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("trial_funnel_checkouts_interval_check", sql`${t.interval} IN ('monthly','yearly')`),
  check("trial_funnel_checkouts_reason_check", sql`${t.reason} IN ('trial_expired','trial_exhausted')`),
]);

export const insertTrialFunnelEventSchema = createInsertSchema(trialFunnelEventsTable);
export type TrialFunnelEvent = typeof trialFunnelEventsTable.$inferSelect;
