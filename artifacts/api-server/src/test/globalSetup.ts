import { migrateReceiptPurchaseType, migrateReceiptReturnDays, migrateReceiptWarrantyColumns } from "../lib/receiptColumns";
import { migrateMailImportFailures } from "../lib/mailImportFailures";
import { migrateTrialAiReads } from "../lib/trialAiReads";
import { migrateRecurringSuppliers } from "../lib/recurringSuppliers";
import { migrateAccountMarket } from "../lib/marketMigration";
import { migrateLifecycleEmails } from "../lib/lifecycleEmailStore";
import { migrateLandingEventCounts } from "../lib/landingEvents";
import { migrateMarketInterestCounts } from "../lib/marketInterest";
import { migrateAccountOnboarding } from "../lib/onboarding";
import { migrateActionRateLimits } from "../lib/actionRateLimit";

/** Integration tests share the dev DB: apply the same idempotent startup migrations first. */
export default async function setup(): Promise<void> {
  await migrateAccountMarket();
  await migrateMarketInterestCounts();
  await migrateLandingEventCounts();
  await migrateLifecycleEmails();
  await migrateAccountOnboarding();
  await migrateActionRateLimits();
  await migrateReceiptWarrantyColumns();
  await migrateReceiptPurchaseType();
  await migrateReceiptReturnDays();
  await migrateTrialAiReads();
  await migrateMailImportFailures();
  await migrateRecurringSuppliers();
}
