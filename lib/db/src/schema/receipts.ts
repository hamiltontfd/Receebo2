import {
  pgTable,
  serial,
  integer,
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
  /** When the goods were delivered (online orders), if known. Return windows count from it. */
  deliveryDate: date("delivery_date", { mode: "string" }),
  total: doublePrecision("total"),
  currency: text("currency"),
  category: text("category"),
  summary: text("summary"),
  ocrText: text("ocr_text"),
  transactionNumber: text("transaction_number"),
  products: jsonb("products").$type<ReceiptProductItem[]>().notNull().default([]),
  notableItems: jsonb("notable_items").$type<ReceiptNotableItem[]>().notNull().default([]),
  purchaseCountry: text("purchase_country"),
  isOnlinePurchase: boolean("is_online_purchase"),
  returnReminderSent7dAt: timestamp("return_reminder_sent_7d_at", { withTimezone: true }),
  returnReminderSent2dAt: timestamp("return_reminder_sent_2d_at", { withTimezone: true }),
  returnPushSent2dAt: timestamp("return_push_sent_2d_at", { withTimezone: true }),
  returnPushSent1dAt: timestamp("return_push_sent_1d_at", { withTimezone: true }),
  /** ISO expiry date (YYYY-MM-DD) the warranty reminder was last sent for (dedup). */
  warrantyReminderSentFor: text("warranty_reminder_sent_for"),
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

export const receiptAttachmentsTable = pgTable("receipt_attachments", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id")
    .notNull()
    .references(() => receiptsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  originalFileName: text("original_file_name").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReceiptAttachmentSchema = createInsertSchema(receiptAttachmentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReceiptAttachment = z.infer<typeof insertReceiptAttachmentSchema>;
export type ReceiptAttachmentRow = typeof receiptAttachmentsTable.$inferSelect;
