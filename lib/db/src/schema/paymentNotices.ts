import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { userBillingTable } from "./userBilling";

// Application delivery ledger, not a second source of subscription truth.
export const paymentNoticesTable = pgTable("payment_notices", {
  invoiceId: text("invoice_id").primaryKey(),
  userId: text("user_id").notNull().references(() => userBillingTable.userId, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});
