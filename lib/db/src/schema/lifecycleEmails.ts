import { pgTable, serial, integer, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Lifecycle emails (trial_ended, deletion_warning_30d/7d, account_deleted),
 * marketing spec 2 Nov 2026. Additive tables, created by the API startup
 * migration (artifacts/api-server/src/lib/lifecycleEmailStore.ts).
 *
 * One row per send. The row is claimed (inserted) before the send so the
 * rating links can carry its id; it is removed again if Resend refuses.
 * idempotency_key = "{email_type}:{user_id}:{deletion_date}" (also sent to
 * Resend as its Idempotency-Key). Rows are deleted with the account.
 */
export const emailSendsTable = pgTable("email_sends", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  emailType: text("email_type").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  deletionDate: date("deletion_date", { mode: "string" }),
  locale: text("locale").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  resendId: text("resend_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Smile rating from a lifecycle email (good | ok | bad), last click wins.
 * On account deletion the row is anonymised: user_id and email_send_id set to
 * null and the free comment deleted; rating, email_type, locale and dates stay.
 */
export const emailFeedbackTable = pgTable("email_feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  emailType: text("email_type").notNull(),
  emailSendId: integer("email_send_id"),
  rating: text("rating").notNull(),
  locale: text("locale").notNull(),
  comment: text("comment"),
  clickCount: integer("click_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("email_feedback_user_type_send_key").on(t.userId, t.emailType, t.emailSendId),
]);

export type EmailSend = typeof emailSendsTable.$inferSelect;
export type EmailFeedback = typeof emailFeedbackTable.$inferSelect;
