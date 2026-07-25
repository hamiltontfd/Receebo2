/**
 * Seed Stripe products and prices for Receebo Pro.
 *
 * Run once after connecting the Stripe integration:
 *   pnpm --filter @workspace/api-server exec tsx ../../../scripts/seed-stripe-products.ts
 *
 * Idempotent — safe to run multiple times.
 */

import Stripe from "stripe";

async function getStripeCredentials(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Missing Replit environment variables. Run this script inside the Replit environment.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) throw new Error(`Failed to fetch Stripe credentials: ${resp.status}`);

  const data = await resp.json() as {
    items?: Array<{ settings?: { secret_key?: string } }>;
  };
  const secretKey = data.items?.[0]?.settings?.secret_key;
  if (!secretKey) throw new Error("Stripe integration not connected.");
  return secretKey;
}

async function main() {
  const secretKey = await getStripeCredentials();
  const stripe = new Stripe(secretKey);

  // Check if Pro product already exists
  const existing = await stripe.products.search({
    query: "name:'Receebo Pro' AND active:'true'",
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    console.log(`Receebo Pro product already exists: ${product.id}`);

    const prices = await stripe.prices.list({ product: product.id, active: true });
    for (const price of prices.data) {
      const interval = (price.recurring as Stripe.Price.Recurring | null)?.interval ?? "one_time";
      const amount = ((price.unit_amount ?? 0) / 100).toFixed(2);
      console.log(
        `  Price: ${price.id}  ${amount} ${price.currency?.toUpperCase()}/${interval}`,
      );
    }
    console.log("\nSet these price IDs as environment secrets:");
    console.log("  STRIPE_MONTHLY_PRICE_ID=price_...");
    console.log("  STRIPE_YEARLY_PRICE_ID=price_...");
    return;
  }

  // Create product
  const product = await stripe.products.create({
    name: "Receebo Pro",
    description: "Unlimited receipt uploads, AI extraction, and natural-language search.",
  });
  console.log(`Created product: ${product.id}`);

  // Monthly price — EUR 2.99/month
  const monthly = await stripe.prices.create({
    product: product.id,
    unit_amount: 299,
    currency: "eur",
    recurring: { interval: "month" },
  });
  console.log(`Created monthly price: ${monthly.id}  (EUR 2.99/month)`);

  // Yearly price — EUR 24.99/year
  const yearly = await stripe.prices.create({
    product: product.id,
    unit_amount: 2499,
    currency: "eur",
    recurring: { interval: "year" },
  });
  console.log(`Created yearly price: ${yearly.id}  (EUR 24.99/year)`);

  console.log("\nProducts and prices created successfully!");
  console.log("Now set these as Replit secrets:");
  console.log(`  STRIPE_MONTHLY_PRICE_ID=${monthly.id}`);
  console.log(`  STRIPE_YEARLY_PRICE_ID=${yearly.id}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
