import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { hasCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";

/**
 * Signed-in Clerk users only. Guest mode is switched off on the server: the
 * x-guest-id header is ignored and never grants access (no guest_sessions
 * lookup, no lazy registration of legacy guest-* ids). Old guests move their
 * receipts with POST /guest-session/claim after signing in.
 */
export async function requireSignedInUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (await isAccountDeletionInProgress(clerkUserId)) {
    res.status(423).json({
      error: "Account deletion is in progress",
      code: "ACCOUNT_DELETION_IN_PROGRESS",
    });
    return;
  }
  if (!(await hasCurrentLegalAcceptance(clerkUserId))) {
    res.status(428).json({
      error: "Current Terms, Privacy Policy, and 18+ confirmation are required",
      code: "LEGAL_ACCEPTANCE_REQUIRED",
    });
    return;
  }
  req.userId = clerkUserId;
  next();
}

/** Kept for existing call sites; guests are no longer accepted. */
export const requireAuthOrGuest = requireSignedInUser;
