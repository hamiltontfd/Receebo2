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
  // Trust the reverse-proxy IP forwarding already set on the Express app.
  // This is scoped to this middleware so it doesn't affect other routes.
  skipSuccessfulRequests: false,
});
