import {
  pgTable,
  serial,
  text,
  date,
  doublePrecision,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ReceiptProductItem = {
  name: string;
  quantity: number | null;
  price: number | null;
};

export type ReceiptNotableItem = {
  name: string;
  price?: number | null;
  category?: string | null;
  reason: string;
};

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  objectPath: text("object_path").notNull(),
  originalFileName: text("original_file_name").notNull(),
  contentType: text("content_type").notNull(),
  status: text("status").notNull().default("processing"),
  isDraft: boolean("is_draft").notNull().default(false),
  warranty: text("warranty"),
  merchant: text("merchant"),
  purchaseDate: date("purchase_date", { mode: "string" }),
  total: doublePrecision("total"),
  currency: text("currency"),
  category: text("category"),
  summary: text("summary"),
  ocrText: text("ocr_text"),
  products: jsonb("products").$type<ReceiptProductItem[]>().notNull().default([]),
  notableItems: jsonb("notable_items").$type<ReceiptNotableItem[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;
