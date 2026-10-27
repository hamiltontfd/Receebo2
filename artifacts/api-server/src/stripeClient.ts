import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import { guardPoolErrors } from "@workspace/db";
import { logger } from "./lib/logger";

async function resolveStripeSecretKey(): Promise<string> {
  const production = process.env.NODE_ENV === "production";
  const expectedPrefix = production ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
  // A shared live key must never make preview actions create live resources.
  const explicitKey = production
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY ||
      (process.env.STRIPE_SECRET_KEY?.match(/^(sk|rk)_test_/) ? process.env.STRIPE_SECRET_KEY : undefined);
  if (explicitKey) {
    if (!expectedPrefix.test(explicitKey)) throw new Error("Stripe credential mode does not match this environment");
    return explicitKey;
  }
  if (production) throw new Error("Production STRIPE_SECRET_KEY is required");

  // 2. Fall back to Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe integration not connected. " +
        "Set STRIPE_SECRET_KEY or connect Stripe via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as {
    items?: Array<{ settings?: { secret?: string; secret_key?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  const secretKey = settings?.secret ?? settings?.secret_key;

  if (!secretKey) {
    throw new Error(
      "Stripe integration not connected. " +
        "Set STRIPE_SECRET_KEY or connect Stripe via the Integrations tab.",
    );
  }

  if (!expectedPrefix.test(secretKey)) {
    throw new Error("Development Stripe connector must use test-mode credentials");
  }
  return secretKey;
}


export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = await resolveStripeSecretKey();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const secretKey = await resolveStripeSecretKey();

  // Do NOT pass a stripeWebhookSecret here.  StripeSync's processWebhook
  // falls back to querying stripe._managed_webhooks (the DB table populated
  // by findOrCreateManagedWebhook at startup) when no explicit secret is
  // provided.  This is the correct verification path for both dev and
  // production: each environment registers its own managed webhook endpoint
  // whose secret is stored in the DB and used for signature validation.
  //
  // Passing STRIPE_WEBHOOK_SECRET here would break production if the shared
  // secret corresponds to the dev webhook endpoint (different signing key).
  const sync = new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: "",
  });
  guardStripeSyncPool(sync);
  return sync;
}

/** StripeSync owns its own pg Pool; without an error listener an idle-connection drop crashes the API. */
export function guardStripeSyncPool(sync: StripeSync): void {
  const pool = sync.postgresClient?.pool;
  if (pool && typeof pool.on === "function") {
    guardPoolErrors(pool, "stripe-sync", (message, details) => logger.error(details, message));
  } else {
    logger.warn("StripeSync pool not found; its idle connection errors are unguarded");
  }
}
