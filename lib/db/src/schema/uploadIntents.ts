import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const uploadIntentsTable = pgTable("upload_intents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  objectPath: text("object_path").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
