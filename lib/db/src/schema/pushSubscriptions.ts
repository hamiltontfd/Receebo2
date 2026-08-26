import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
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