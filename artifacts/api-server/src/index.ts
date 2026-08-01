import app from "./app";
import { logger } from "./lib/logger";
import { startExtractionWatchdog } from "./lib/extractionQueue";
import { startOrphanCleanupScheduler } from "./lib/orphanCleanup";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Ensure the stripe schema and user_billing columns exist.
 * Uses IF NOT EXISTS so it is safe to run on every startup.
 * This runs inline (before the server accepts requests) so that
 * stripe.subscriptions is always queryable when routes are hit.
 */
async function runStartupMigrations(): Promise<void> {
  try {
    // user_billing table — created by drizzle migration 0002 but guard here too
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_billing (
        user_id               text PRIMARY KEY,
        stripe_customer_id    text NOT NULL UNIQUE,
        stripe_subscription_id text,
        trial_reminder_sent_at timestamptz,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now()
      )
    `);

    // stripe_subscription_id column — added by migration 0003; guard here too
    await db.execute(sql`
      ALTER TABLE user_billing
        ADD COLUMN IF NOT EXISTS stripe_subscription_id text
    `);

    // trial_reminder_sent_at column — guard for tables created before this column existed
    await db.execute(sql`
      ALTER TABLE user_billing
        ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamptz
    `);

    // Consumer rights columns — added to receipts table
    await db.execute(sql`
      ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS purchase_country text
    `);
    await db.execute(sql`
      ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS is_online_purchase boolean
    `);

    logger.info("Startup migrations applied");
  } catch (err) {
    logger.warn({ err }, "Startup migrations warning (non-fatal) — continuing");
  }
}

async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  try {
    const { getStripeSync } = await import("./stripeClient");
    const stripeSync = await getStripeSync();

    // Ensure stripe schema tables exist (stripe-replit-sync manages its own schema)
    // runMigrations from stripe-replit-sync cannot be called from the esbuild bundle
    // because __dirname resolves incorrectly inside the bundle. Instead we rely on
    // the managed webhook path which initialises the schema via syncBackfill.
    logger.info("Stripe schema ready");

    const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
    const webhookBaseUrl = domains[0] ? `https://${domains[0]}` : null;
    if (webhookBaseUrl) {
      const webhookUrl = `${webhookBaseUrl}/api/stripe/webhook`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (stripeSync as any).findOrCreateManagedWebhook(webhookUrl);
      logger.info("Stripe managed webhook configured");
    }

    void stripeSync.syncBackfill().then(() => {
      logger.info("Stripe backfill complete");
    }).catch((err) => {
      logger.warn({ err }, "Stripe backfill error (non-fatal)");
    });
  } catch (err: any) {
    if (
      err?.message?.includes("Stripe integration not connected") ||
      err?.message?.includes("Missing Replit environment")
    ) {
      logger.info("Stripe integration not connected — skipping Stripe init");
    } else {
      logger.warn({ err }, "Stripe init failed (non-fatal) — continuing startup");
    }
  }
}

async function start(): Promise<void> {
  // Apply schema migrations synchronously before accepting requests
  await runStartupMigrations();

  app.listen(port, () => {
    logger.info({ port }, "Server listening");
    startExtractionWatchdog();
    startOrphanCleanupScheduler();
    void initStripe();
  });
}

void start();
