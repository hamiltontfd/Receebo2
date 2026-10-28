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
  /**
   * goods | subscription | digital | service | ticket; null = unknown (old
   * receipts keep today's rules). Anything but goods gets no return window,
   * no warranty dates and no reminders.
   */
  purchaseType: text("purchase_type"),
  /** ai | hint | manual. A manual choice is never overwritten by the backfill. */
  purchaseTypeSource: text("purchase_type_source"),
  returnReminderSent7dAt: timestamp("return_reminder_sent_7d_at", { withTimezone: true }),
  returnReminderSent2dAt: timestamp("return_reminder_sent_2d_at", { withTimezone: true }),
  returnPushSent2dAt: timestamp("return_push_sent_2d_at", { withTimezone: true }),
  returnPushSent1dAt: timestamp("return_push_sent_1d_at", { withTimezone: true }),
  /** ISO expiry date (YYYY-MM-DD) the warranty reminder was last sent for (dedup). */
  warrantyReminderSentFor: text("warranty_reminder_sent_for"),
  /** Server-computed legal warranty end (PT/EU), YYYY-MM-DD. */
  legalWarrantyExpiresOn: date("legal_warranty_expires_on", { mode: "string" }),
  /** Server-computed manufacturer warranty end, YYYY-MM-DD. */
  manufacturerWarrantyExpiresOn: date("manufacturer_warranty_expires_on", { mode: "string" }),
  /** Legal warranty end date the reminder was last sent for (dedup). */
  legalWarrantyReminderSentFor: text("legal_warranty_reminder_sent_for"),
  /** Rules version the stored warranty dates were computed with (startup backfill). */
  warrantyCalcVersion: integer("warranty_calc_version"),
  /** Warranty end dates the push reminder was last sent for (dedup, independent of email). */
  legalWarrantyPushSentFor: text("legal_warranty_push_sent_for"),
  manufacturerWarrantyPushSentFor: text("manufacturer_warranty_push_sent_for"),
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
