import { migrateReceiptPurchaseType, migrateReceiptWarrantyColumns } from "../lib/receiptColumns";
import { migrateMailImportFailures } from "../lib/mailImportFailures";
import { migrateTrialAiReads } from "../lib/trialAiReads";
import { migrateRecurringSuppliers } from "../lib/recurringSuppliers";
import { migrateAccountMarket } from "../lib/marketMigration";
import { migrateActionRateLimits } from "../lib/actionRateLimit";

/** Integration tests share the dev DB: apply the same idempotent startup migrations first. */
export default async function setup(): Promise<void> {
  await migrateAccountMarket();
  await migrateActionRateLimits();
  await migrateReceiptWarrantyColumns();
  await migrateReceiptPurchaseType();
  await migrateTrialAiReads();
  await migrateMailImportFailures();
  await migrateRecurringSuppliers();
}
