import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

export type PendingImportExtractionData = {
  merchant: string | null;
  purchaseDate: string | null;
  total: number | null;
  currency: string | null;
  category: string | null;
  summary: string | null;
  ocrText: string | null;
  warranty: string | null;
  transactionNumber: string | null;
  products: Array<{ name: string; quantity: number | null; price: number | null }>;
  notableItems: Array<{
    name: string;
    price: number | null;
    category: string | null;
    reason: string;
  }>;
  purchaseCountry: string | null;
  isOnlinePurchase: boolean | null;
};

/**
 * Stores per-user Gmail OAuth refresh tokens.
 * Refresh tokens are stored in plaintext — the database connection itself is
 * secured; a separate encryption layer can be added later using a dedicated
 * key secret.
 */
export const gmailConnectionsTable = pgTable("gmail_connections", {
  userId: text("user_id").primaryKey(),
  gmailEmail: text("gmail_email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Records every Gmail message ID that has been processed (successfully or not)
 * to prevent re-processing the same email on subsequent sync runs.
 */
export const gmailSeenMessagesTable = pgTable(
  "gmail_seen_messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.userId, t.gmailMessageId)],
);

/**
 * Receipt candidates extracted from Gmail PDF attachments, waiting for
 * the user to approve or dismiss before landing in the main receipts table.
 */
export const pendingImportsTable = pgTable("pending_imports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  gmailMessageId: text("gmail_message_id").notNull(),
  objectPath: text("object_path").notNull(),
  originalFileName: text("original_file_name").notNull(),
  /** pending | approved | dismissed */
  status: text("status").notNull().default("pending"),
  extractionData: jsonb("extraction_data").$type<PendingImportExtractionData>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type GmailConnection = typeof gmailConnectionsTable.$inferSelect;
export type PendingImport = typeof pendingImportsTable.$inferSelect;
