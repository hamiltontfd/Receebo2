import {
  integer,
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
  /**
   * goods | subscription | digital | service | ticket, from the AI or the
   * sender/text hints (absent on imports stored before 28 Oct 2026).
   */
  purchaseType?: string | null;
  purchaseTypeSource?: string | null;
  /** Absent on imports stored before delivery dates were extracted. */
  deliveryDate?: string | null;
};

/**
 * Stores per-user Gmail OAuth tokens. Access and refresh tokens are encrypted
 * at rest with AES-256-GCM (see api-server/src/lib/tokenCrypto.ts).
 *
 * `status` is "active" or "needs_reconnect" (set when Google rejects the
 * refresh token, e.g. the 7-day expiry of apps in OAuth "Testing" mode).
 */
export const gmailConnectionsTable = pgTable("gmail_connections", {
  userId: text("user_id").primaryKey(),
  gmailEmail: text("gmail_email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  /** active | needs_reconnect */
  status: text("status").notNull().default("active"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Records every mailbox message ID (Gmail or Outlook, see `provider`) that has been processed (successfully or not)
 * to prevent re-processing the same email on subsequent sync runs.
 */
export const gmailSeenMessagesTable = pgTable(
  "gmail_seen_messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** gmail | outlook. Legacy rows are back-filled to "gmail". */
    provider: text("provider").notNull().default("gmail"),
    /** Provider message ID (column name kept for backward compatibility). */
    gmailMessageId: text("gmail_message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.userId, t.gmailMessageId)],
);

/**
 * Receipt candidates extracted from email (Gmail or Outlook) PDF attachments
 * or, for order emails without a PDF, from the HTML body, waiting for
 * the user to approve or dismiss before landing in the main receipts table.
 */
export const pendingImportsTable = pgTable(
  "pending_imports",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** gmail | outlook. Legacy rows are back-filled to "gmail". */
    provider: text("provider").notNull().default("gmail"),
    /** Provider message ID (column name kept for backward compatibility). */
    gmailMessageId: text("gmail_message_id").notNull(),
    /** Provider attachment ID, or "body:html" for an HTML-body import. */
    gmailAttachmentId: text("gmail_attachment_id"),
    claimToken: text("claim_token"),
    objectPath: text("object_path").notNull(),
    originalFileName: text("original_file_name").notNull(),
    /** processing | pending | approved | dismissed */
    status: text("status").notNull().default("pending"),
    approvedReceiptId: integer("approved_receipt_id"),
    extractionData: jsonb("extraction_data").$type<PendingImportExtractionData>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.userId, t.gmailMessageId, t.gmailAttachmentId)],
);

/**
 * Email import attempts that failed (AI extraction, attachment download,
 * storage). A message is retried on later syncs until MAX_IMPORT_ATTEMPTS
 * (api-server/src/lib/mailImportFailures.ts); then status becomes "failed" and
 * the message is marked seen so syncs stop spending AI on it. Failed messages
 * never create a pending import, so they are not shown in the pending list.
 */
export const mailImportFailuresTable = pgTable(
  "mail_import_failures",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    messageId: text("message_id").notNull(),
    /** retrying | failed */
    status: text("status").notNull().default("retrying"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("mail_import_failures_user_provider_message_unique").on(t.userId, t.provider, t.messageId)],
);

export type MailImportFailure = typeof mailImportFailuresTable.$inferSelect;

export type GmailConnection = typeof gmailConnectionsTable.$inferSelect;
export type PendingImport = typeof pendingImportsTable.$inferSelect;
