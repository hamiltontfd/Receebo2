import app from "./app";
import { logger } from "./lib/logger";
import { startExtractionWatchdog } from "./lib/extractionQueue";
import { startOrphanCleanupScheduler } from "./lib/orphanCleanup";

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

async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  try {
    const { runMigrations } = await import("stripe-replit-sync");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const { getStripeSync } = await import("./stripeClient");
    const stripeSync = await getStripeSync();

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

app.listen(port, () => {
  logger.info({ port }, "Server listening");
  startExtractionWatchdog();
  startOrphanCleanupScheduler();
  void initStripe();
});
