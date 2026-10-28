import { index, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * The user's decision about a recurring supplier (subscription or utility
 * bill) found in their email: "approve once". No row = undecided.
 * Created by the idempotent startup migration in
 * api-server/src/lib/recurringSuppliers.ts (migrateRecurringSuppliers).
 */
export const recurringSuppliersTable = pgTable("recurring_suppliers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** Normalised supplier identity (brand or merchant slug, e.g. "edp", "netflix"). */
  supplierKey: text("supplier_key").notNull(),
  /** Short name shown in the app (e.g. "EDP Comercial"). */
  displayName: text("display_name").notNull(),
  /** subscription | utility */
  kind: text("kind").notNull(),
  /** on (import automatically) | off (stop importing). No row = undecided. */
  status: text("status").notNull(),
  /** Category chosen by the user before "Always import"; default for its auto-imports. */
  category: text("category"),
  /** Sender domains seen for this supplier (shared domains like gmail.com never stored). */
  senderDomains: text("sender_domains").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("recurring_suppliers_user_key_unique").on(t.userId, t.supplierKey),
  index("recurring_suppliers_user_idx").on(t.userId),
]);

export type RecurringSupplierRow = typeof recurringSuppliersTable.$inferSelect;
