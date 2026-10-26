import type { RequestHandler } from "express";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";

// Auth/consent run first. Billing, legal, export and deletion are not gated.
export const requireProductAccess: RequestHandler = async (req, res, next) => {
  const status = await getSubscriptionStatus(req.userId!);
  const match = req.originalUrl.split("?")[0].match(/\/receipts\/(\d+)$/);
  const review = match && Number(match[1]) === status.reviewReceiptId &&
    (req.method === "GET" || req.method === "PATCH");
  const objectReview = (status.accessState === "trial_exhausted" || status.accessState === "trial_expired") &&
    req.originalUrl.includes("/storage/objects/") && req.method === "GET";
  if (!status.canUseApp && !review && !objectReview) {
    res.status(403).json({ error: "subscription_required", code: status.accessState,
      message: "Your data is preserved. Subscribe as a Founding Customer to continue." });
    return;
  }
  next();
};
