import { rateLimit } from "express-rate-limit";

/**
 * Rate limiter for POST /guest-session.
 *
 * Allows up to 5 new guest session creations per IP per hour.
 * Legitimate browsers create exactly one guest session and then reuse the
 * stored token (idempotent path), so this limit only affects callers that
 * repeatedly request *new* sessions.
 */
export const guestSessionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Too many guest sessions created from this IP. Please try again later.",
  },
  // Express trust proxy remains false: use the socket peer, NOT caller-supplied
  // forwarding headers. Unverified shared proxies may group visitors together.
  // Do not enable blanket trust to fix that; verify ingress CIDRs first.
  skipSuccessfulRequests: false,
});
