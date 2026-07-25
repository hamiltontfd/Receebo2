import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

/**
 * Resolve the Stripe secret key.
 *
 * Priority order:
 *   1. STRIPE_SECRET_KEY environment variable (standard / deployment-friendly)
 *   2. Replit connector credential fetch (development convenience)
 *
 * Using an env var is the recommended production path and satisfies the
 * "use environment variables for all Stripe credentials" requirement.
 */
async function resolveStripeSecretKey(): Promise<string> {
  // 1. Explicit env var takes priority
  if (process.env.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY;
  }

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

  return secretKey;
}

/**
 * Resolve the Stripe webhook secret.
 *
 * Priority: STRIPE_WEBHOOK_SECRET env var → connector's webhook_secret field.
 */
async function resolveWebhookSecret(): Promise<string | undefined> {
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    return process.env.STRIPE_WEBHOOK_SECRET;
  }

  // Try to get from connector (best-effort, non-blocking)
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

    if (!hostname || !xReplitToken) return undefined;

    const resp = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!resp.ok) return undefined;

    const data = await resp.json() as {
      items?: Array<{ settings?: { webhook_secret?: string } }>;
    };
    return data.items?.[0]?.settings?.webhook_secret;
  } catch {
    return undefined;
  }
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
  const webhookSecret = await resolveWebhookSecret();

  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
