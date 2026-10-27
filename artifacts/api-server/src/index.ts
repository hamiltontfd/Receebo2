import app from "./app";
import { logger, gmailLogger } from "./lib/logger";
import { startExtractionWatchdog } from "./lib/extractionQueue";
import { startOrphanCleanupScheduler } from "./lib/orphanCleanup";
import { startGmailSyncScheduler } from "./lib/gmailSync";
import { startOutlookSyncScheduler, isOutlookConfigured } from "./lib/outlookSync";
import { isMailProviderEnabled } from "./lib/mailProviders/config";
import { encryptToken, decryptToken } from "./lib/tokenCrypto";
import { sql, eq } from "drizzle-orm";
import { db, gmailConnectionsTable } from "@workspace/db";
import { spawn } from "child_process";
import { fileURLToPath } from "node:url";
import { billingOrigin } from "./lib/billingUrls";
import { migrateTrialFunnel } from "./lib/trialFunnelMigration";
import { extendTrialsToCurrentDuration, uncountUnsavedTrialDrafts } from "./lib/accountTrial";
import { migrateTrialAiReads } from "./lib/trialAiReads";
import { migrateAccountLifecycle } from "./lib/accountLifecycle";
import { migrateAccountDeletionCodes } from "./lib/accountDeletionCode";
import { migrateReceiptDeliveryDate } from "./lib/receiptColumns";

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

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_notices (
        invoice_id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES user_billing(user_id) ON DELETE CASCADE,
        sent_at timestamptz NOT NULL DEFAULT now()
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

    // Return window reminder dedup columns
    await db.execute(sql`
      ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS return_reminder_sent_7d_at timestamptz
    `);
    await db.execute(sql`
      ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS return_reminder_sent_2d_at timestamptz
    `);
    await db.execute(sql`
      ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS return_push_sent_2d_at timestamptz
    `);
    await db.execute(sql`
      ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS return_push_sent_1d_at timestamptz
    `);
    // Warranty reminder dedup (expiry date already reminded)
    await db.execute(sql`
      ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS warranty_reminder_sent_for text
    `);
    // Return windows count from the delivery date when known
    await migrateReceiptDeliveryDate();
    // Daily job lock so restarts/extra instances don't rerun the sweep
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scheduled_job_runs (
        job             text PRIMARY KEY,
        last_started_at timestamptz NOT NULL
      )
    `);

    // Dedicated user preferences table (notification opt-out, etc.)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id               text PRIMARY KEY,
        notifications_opt_out boolean NOT NULL DEFAULT false,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id           serial PRIMARY KEY,
        user_id      text NOT NULL,
        endpoint     text NOT NULL UNIQUE,
        p256dh       text NOT NULL,
        auth         text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS legal_acceptances (
        id              serial PRIMARY KEY,
        user_id         text NOT NULL,
        terms_version   text NOT NULL,
        privacy_version text NOT NULL,
        confirmed_age   boolean NOT NULL DEFAULT true,
        accepted_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE legal_acceptances
      ADD COLUMN IF NOT EXISTS confirmed_age boolean NOT NULL DEFAULT true
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS account_deletion_requests (
        user_id      text PRIMARY KEY,
        stage        text NOT NULL DEFAULT 'requested',
        last_error   text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Gmail integration tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gmail_connections (
        user_id       text PRIMARY KEY,
        gmail_email   text,
        access_token  text,
        refresh_token text NOT NULL,
        token_expiry  timestamptz,
        last_synced_at timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gmail_seen_messages (
        id              serial PRIMARY KEY,
        user_id         text NOT NULL,
        gmail_message_id text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, gmail_message_id)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pending_imports (
        id                serial PRIMARY KEY,
        user_id           text NOT NULL,
        gmail_message_id  text NOT NULL,
        gmail_attachment_id text,
        claim_token       text,
        object_path       text NOT NULL,
        original_file_name text NOT NULL,
        status            text NOT NULL DEFAULT 'pending',
        approved_receipt_id integer,
        extraction_data   jsonb,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE pending_imports
        ADD COLUMN IF NOT EXISTS gmail_attachment_id text,
        ADD COLUMN IF NOT EXISTS claim_token text,
        ADD COLUMN IF NOT EXISTS approved_receipt_id integer
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pending_imports_gmail_attachment_unique
      ON pending_imports (user_id, gmail_message_id, gmail_attachment_id)
    `);

    // Multi-provider mail import (Outlook etc.). Additive and backward
    // compatible: existing Gmail rows are back-filled via column defaults.
    await db.execute(sql`
      ALTER TABLE gmail_connections
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS last_error text
    `);
    await db.execute(sql`
      ALTER TABLE gmail_seen_messages
        ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail'
    `);
    await db.execute(sql`
      ALTER TABLE pending_imports
        ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail'
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_connections (
        id             serial PRIMARY KEY,
        user_id        text NOT NULL,
        provider       text NOT NULL,
        account_email  text,
        access_token   text,
        refresh_token  text NOT NULL,
        token_expiry   timestamptz,
        status         text NOT NULL DEFAULT 'active',
        last_error     text,
        last_synced_at timestamptz,
        delta_link     text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT email_connections_user_provider_unique UNIQUE (user_id, provider)
      )
    `);

    // Upload intents — short-lived records binding a presigned URL to the user
    // who requested it, consumed when a receipt/attachment is created.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS upload_intents (
        id          serial PRIMARY KEY,
        user_id     text NOT NULL,
        object_path text NOT NULL,
        expires_at  timestamptz NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Purge any expired intents left over from previous runs
    await db.execute(sql`DELETE FROM upload_intents WHERE expires_at < now()`);

    logger.info("Startup migrations applied");
  } catch (err) {
    logger.warn({ err }, "Startup migrations warning (non-fatal) — continuing");
  }
}

/**
 * One-time migration: encrypt any gmail_connections rows that still have
 * plaintext access_token / refresh_token values (stored before AES-256-GCM
 * encryption was introduced).
 *
 * Idempotent — rows that are already encrypted (prefixed with `enc:v1:`) are
 * left untouched.  Safe to run on every startup.
 */
async function migrateGmailTokenEncryption(): Promise<void> {
  try {
    const encKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    if (!encKey) {
      logger.info(
        "GMAIL_TOKEN_ENCRYPTION_KEY not set — skipping Gmail token encryption migration",
      );
      return;
    }

    const rows = await db.select().from(gmailConnectionsTable);
    if (rows.length === 0) {
      logger.info("Gmail token encryption migration: no rows found, nothing to do");
      return;
    }

    let migrated = 0;

    for (const row of rows) {
      const updates: Partial<typeof gmailConnectionsTable.$inferInsert> = {};

      // Check and encrypt access_token if plaintext
      if (row.accessToken !== null) {
        const { wasPlaintext } = decryptToken(row.accessToken);
        if (wasPlaintext) {
          updates.accessToken = encryptToken(row.accessToken);
        }
      }

      // Check and encrypt refresh_token if plaintext
      const { wasPlaintext: refreshWasPlaintext } = decryptToken(row.refreshToken);
      if (refreshWasPlaintext) {
        updates.refreshToken = encryptToken(row.refreshToken);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db
          .update(gmailConnectionsTable)
          .set(updates)
          .where(eq(gmailConnectionsTable.userId, row.userId));
        migrated++;
        logger.info(
          { userId: row.userId },
          "Gmail token encryption migration: encrypted plaintext tokens",
        );
      }
    }

    logger.info(
      { total: rows.length, migrated },
      "Gmail token encryption migration complete",
    );
  } catch (err) {
    gmailLogger.warn({ err }, "Gmail token encryption migration failed (non-fatal) — continuing");
  }
}

/**
 * Run stripe-replit-sync schema migrations via the standalone script at
 * scripts/run-stripe-migrations.mjs.  The bundled server cannot call
 * runMigrations() directly because esbuild rewrites __dirname to a virtual
 * path that does not resolve to the package's migrations directory.  Spawning
 * an external Node.js process avoids this constraint.
 *
 * Throws if the script exits with a non-zero code so callers know the
 * stripe._managed_webhooks table may not exist.
 */
async function runStripeMigrations(): Promise<void> {
  // Works from both artifact-local dev commands and repository-root deployment commands.
  const scriptPath = fileURLToPath(new URL("../scripts/run-stripe-migrations.mjs", import.meta.url));
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath], {
      env: process.env,
      stdio: "inherit",
    });
    proc.on("close", (code) => {
      if (code === 0) {
        logger.info("Stripe schema migrations applied");
        resolve();
      } else {
        reject(new Error(`Stripe migration script exited with code ${code}`));
      }
    });
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Stripe migration script: ${err.message}`));
    });
  });
}

async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  try {
    // Run StripeSync schema migrations.  Non-fatal if they fail because the
    // schema is already fully set up (e.g. trigger already exists after a
    // migration tracking table reset) — the tables we need are already there.
    try {
      await runStripeMigrations();
    } catch (migrationErr: any) {
      logger.warn(
        { err: migrationErr },
        "Stripe migrations failed — schema likely already up to date, continuing",
      );
    }

    const { getStripeSync } = await import("./stripeClient");
    const stripeSync = await getStripeSync();

    const webhookBaseUrl = billingOrigin();
    const webhookUrl = `${webhookBaseUrl}/api/stripe/webhook`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (stripeSync as any).findOrCreateManagedWebhook(webhookUrl);
    logger.info({ webhookUrl }, "Stripe managed webhook configured");

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
      logger.error({ err }, "Stripe init failed — live payments may not activate subscriptions");
    }
  }
}

async function start(): Promise<void> {
  // Apply schema migrations synchronously before accepting requests
  await runStartupMigrations();
  await migrateTrialFunnel();
  try {
    // Uploads count only once saved: unsaved drafts counted under the old rule stop counting.
    const uncounted = await uncountUnsavedTrialDrafts();
    if (uncounted > 0) logger.info({ uncounted }, "Unsaved trial drafts no longer count toward the receipt cap");
  } catch (err) {
    logger.warn({ err }, "Trial draft migration warning (non-fatal) — continuing");
  }
  try {
    await migrateAccountLifecycle();
  } catch (err) {
    logger.warn({ err }, "Account lifecycle migration warning (non-fatal) — continuing");
  }
  try {
    await migrateAccountDeletionCodes();
  } catch (err) {
    logger.warn({ err }, "Account deletion code migration warning (non-fatal) — continuing");
  }
  try {
    await migrateTrialAiReads();
  } catch (err) {
    logger.warn({ err }, "Trial AI reads migration warning (non-fatal) — continuing");
  }
  // Trials started under the old 7-day rule get the full 15 days from their
  // original start (idempotent; also reopens 7-day trials that ended < 15 days ago).
  try {
    const extended = await extendTrialsToCurrentDuration();
    if (extended > 0) logger.info({ extended }, "Extended account trials to current duration");
  } catch (err) {
    logger.error({ err }, "Failed to extend account trials to current duration");
  }
  // Encrypt any gmail_connections rows that still have plaintext tokens
  await migrateGmailTokenEncryption();

  app.listen(port, () => {
    logger.info({ port }, "Server listening");
    startExtractionWatchdog();
    startOrphanCleanupScheduler();
    // Mail import schedulers run only for providers enabled via
    // MAIL_PROVIDERS_ENABLED (default: outlook). Gmail is off by default.
    if (isMailProviderEnabled("gmail")) {
      startGmailSyncScheduler();
    } else {
      gmailLogger.info("Gmail import disabled by MAIL_PROVIDERS_ENABLED; scheduler not started");
    }
    if (isMailProviderEnabled("outlook") && isOutlookConfigured()) {
      startOutlookSyncScheduler();
    } else {
      logger.info(
        { enabled: isMailProviderEnabled("outlook"), configured: isOutlookConfigured() },
        "Outlook import inactive; scheduler not started",
      );
    }
    void initStripe();
  });
}

void start();
