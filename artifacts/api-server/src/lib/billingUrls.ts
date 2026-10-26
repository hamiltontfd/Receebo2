interface BillingEnvironment {
  NODE_ENV?: string;
  REPLIT_DEV_DOMAIN?: string;
}

// Verified published origin. Never derive payment redirects from request headers,
// request bodies, or workspace domain variables in production.
const PUBLISHED_ORIGIN = "https://receebo.net";

export function billingOrigin(environment: BillingEnvironment = process.env): string {
  if (environment.NODE_ENV === "production") return PUBLISHED_ORIGIN;

  const domain = environment.REPLIT_DEV_DOMAIN;
  if (!domain || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+replit\.dev$/i.test(domain)) {
    throw new Error("A valid REPLIT_DEV_DOMAIN is required for development billing redirects");
  }
  return `https://${domain}`;
}
