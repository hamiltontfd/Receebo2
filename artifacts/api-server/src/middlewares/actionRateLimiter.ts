import type { RequestHandler } from "express";
import { consumeAction, type LimitedAction } from "../lib/actionRateLimit";

/** Must be mounted AFTER validated Clerk/guest auth and BEFORE action work. */
export function actionRateLimiter(action: LimitedAction): RequestHandler {
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const result = await consumeAction(action, req.userId);
      if (!result.allowed) {
        res.setHeader("Retry-After", result.retryAfter);
        res.status(429).json({
          code: "ACTION_RATE_LIMITED",
          error: "Too many requests",
          action,
          retryAfterSeconds: result.retryAfter,
        });
        return;
      }
    } catch (err) {
      req.log?.error({ err, action }, "Action rate-limit storage unavailable");
      // Not a quota failure: fail closed, explicitly distinguish infrastructure.
      res.setHeader("Retry-After", "10");
      res.status(503).json({
        code: "ACTION_LIMIT_UNAVAILABLE",
        error: "Action temporarily unavailable",
        retryAfterSeconds: 10,
      });
      return;
    }
    // Outside catch: downstream errors are not reported as limiter outages.
    next();
  };
}

export const uploadRateLimiter = actionRateLimiter("upload");
export const receiptReadRateLimiter = actionRateLimiter("receipt-read");
export const manualSyncRateLimiter = actionRateLimiter("mail-sync");
