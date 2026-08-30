import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { hasCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const LEGAL_EXEMPT_PATHS = new Set([
  "/legal/acceptance",
  "/account",
  "/account/export",
  "/billing/subscription",
  "/billing/create-portal-session",
  "/gmail/disconnect",
]);

function isConsentWithdrawal(req: Request): boolean {
  return (
    (req.path === "/notifications/preferences" &&
      req.method === "PATCH" &&
      req.body?.optOut === true) ||
    (req.path === "/push/subscribe" && req.method === "DELETE")
  );
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId =
    (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  const deletionExempt =
    req.path === "/account" ||
    (req.path === "/legal/acceptance" && req.method === "GET");
  if (!deletionExempt && (await isAccountDeletionInProgress(userId))) {
    res.status(423).json({
      error: "Account deletion is in progress",
      code: "ACCOUNT_DELETION_IN_PROGRESS",
    });
    return;
  }
  if (
    !LEGAL_EXEMPT_PATHS.has(req.path) &&
    !isConsentWithdrawal(req) &&
    !(await hasCurrentLegalAcceptance(userId))
  ) {
    res.status(428).json({
      error: "Current Terms, Privacy Policy, and 18+ confirmation are required",
      code: "LEGAL_ACCEPTANCE_REQUIRED",
    });
    return;
  }
  next();
}
