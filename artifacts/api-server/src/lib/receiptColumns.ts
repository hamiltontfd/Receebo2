import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** receipts.delivery_date (return windows count from delivery). Idempotent startup migration. */
export async function migrateReceiptDeliveryDate(): Promise<void> {
  await db.execute(sql`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS delivery_date date`);
}
