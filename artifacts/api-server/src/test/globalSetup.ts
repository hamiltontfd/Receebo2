import { migrateReceiptWarrantyColumns } from "../lib/receiptColumns";

/** Integration tests share the dev DB: apply the same idempotent startup migrations first. */
export default async function setup(): Promise<void> {
  await migrateReceiptWarrantyColumns();
}
