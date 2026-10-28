import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** receipts.delivery_date (return windows count from delivery). Idempotent startup migration. */
export async function migrateReceiptDeliveryDate(): Promise<void> {
  await db.execute(sql`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS delivery_date date`);
}

/** Server-side warranty end dates (legal + manufacturer) and their reminder dedup. Idempotent startup migration. */
export async function migrateReceiptWarrantyColumns(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE receipts
      ADD COLUMN IF NOT EXISTS legal_warranty_expires_on date,
      ADD COLUMN IF NOT EXISTS manufacturer_warranty_expires_on date,
      ADD COLUMN IF NOT EXISTS legal_warranty_reminder_sent_for text,
      ADD COLUMN IF NOT EXISTS warranty_calc_version integer,
      ADD COLUMN IF NOT EXISTS legal_warranty_push_sent_for text,
      ADD COLUMN IF NOT EXISTS manufacturer_warranty_push_sent_for text`);
}

/**
 * receipts.purchase_type (+ source): subscriptions, digital purchases, tickets
 * and services get no return/warranty dates. Idempotent startup migration;
 * existing rows stay null (today's behaviour) until the gated backfill.
 */
export async function migrateReceiptPurchaseType(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE receipts
      ADD COLUMN IF NOT EXISTS purchase_type text,
      ADD COLUMN IF NOT EXISTS purchase_type_source text`);
}
