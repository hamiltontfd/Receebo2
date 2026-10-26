export function billingPriceId(plan: "monthly" | "yearly"): string | undefined {
  const mode = process.env.NODE_ENV === "production" ? "LIVE" : "TEST";
  const interval = plan.toUpperCase();
  return process.env[`STRIPE_${mode}_${interval}_PRICE_ID`] ||
    process.env[`STRIPE_${interval}_PRICE_ID`];
}

export function billingPortalConfiguration(): string | undefined {
  return process.env.NODE_ENV === "production"
    ? process.env.STRIPE_LIVE_PORTAL_CONFIGURATION_ID
    : process.env.STRIPE_TEST_PORTAL_CONFIGURATION_ID;
}
