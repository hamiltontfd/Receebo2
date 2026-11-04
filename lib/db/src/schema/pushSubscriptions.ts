import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { encryptedText } from "../encryptedColumns";

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: encryptedText("p256dh", "push_subscriptions.p256dh", "").notNull(),
    auth: encryptedText("auth", "push_subscriptions.auth", "").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    endpointUnique: unique("push_subscriptions_endpoint_unique").on(table.endpoint),
  }),
);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;