import { migrateReceiptWarrantyColumns } from "../lib/receiptColumns";
import { migrateMailImportFailures } from "../lib/mailImportFailures";
import { migrateTrialAiReads } from "../lib/trialAiReads";

/** Integration tests share the dev DB: apply the same idempotent startup migrations first. */
export default async function setup(): Promise<void> {
  await migrateReceiptWarrantyColumns();
  await migrateTrialAiReads();
  await migrateMailImportFailures();
}
