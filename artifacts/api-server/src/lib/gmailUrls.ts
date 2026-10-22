import type { Request } from "express";

// Canonical published origin, verified against the deployment configuration.
// OAuth callbacks must be identical during authorization and token exchange.
const PUBLISHED_ORIGIN = "https://receebo.net";

interface GmailUrlEnvironment {
  NODE_ENV?: string;
  REPLIT_DEV_DOMAIN?: string;
}

export function gmailOrigin(
  req: Pick<Request, "protocol" | "get">,
  environment: GmailUrlEnvironment = process.env,
): string {
  // Never use workspace domains or proxy-internal HTTP hosts in production.
  if (environment.NODE_ENV === "production") return PUBLISHED_ORIGIN;
  if (environment.REPLIT_DEV_DOMAIN) {
    return `https://${environment.REPLIT_DEV_DOMAIN}`;
  }
  return `${req.protocol}://${req.get("host")}`;
}
