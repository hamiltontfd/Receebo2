// Explicit operator command, never a startup hook. Does not create customers,
// subscriptions, charges or checkout sessions.
// Run with node --experimental-strip-types after choosing NODE_ENV.
import { getUncachableStripeClient } from "../src/stripeClient.ts";

const live = process.env.NODE_ENV === "production";
const stripe = await getUncachableStripeClient();
const prices = await stripe.prices.list({ active: true, limit: 100 });
const plans = {};
for (const [plan, interval, amount] of [["monthly", "month", 299], ["yearly", "year", 2499]]) {
  const matches = prices.data.filter(p => p.livemode === live && p.currency === "eur" &&
    p.unit_amount === amount && p.recurring?.interval === interval && p.recurring.interval_count === 1);
  if (matches.length !== 1) throw new Error(`Expected exactly one compatible ${plan} price`);
  plans[plan] = matches[0].id;
}
const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
let portal = configurations.data.find(p => p.active && p.metadata.receebo_billing === "managed");
if (!portal) {
  portal = await stripe.billingPortal.configurations.create({
    name: live ? "Receebo subscriptions" : "Receebo subscription tests",
    metadata: { receebo_billing: "managed" },
    default_return_url: live ? "https://receebo.net/settings" : `https://${process.env.REPLIT_DEV_DOMAIN}/settings`,
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    },
    business_profile: { headline: "Manage your Receebo subscription" },
  }, { idempotencyKey: `receebo-portal-${live ? "live" : "test"}-managed` });
}
if (!portal.features.subscription_cancel.enabled) throw new Error("Portal cancellation is not enabled");
console.log(JSON.stringify({ mode: live ? "live" : "test", plans, portal: portal.id,
  cancellationEnabled: portal.features.subscription_cancel.enabled }));
