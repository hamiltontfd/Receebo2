import { db, legalAcceptancesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

export const TERMS_VERSION = "2026-08-30";
export const PRIVACY_VERSION = "2026-08-30";

export async function hasCurrentLegalAcceptance(userId: string): Promise<boolean> {
  const [acceptance] = await db
    .select({ id: legalAcceptancesTable.id })
    .from(legalAcceptancesTable)
    .where(
      and(
        eq(legalAcceptancesTable.userId, userId),
        eq(legalAcceptancesTable.termsVersion, TERMS_VERSION),
        eq(legalAcceptancesTable.privacyVersion, PRIVACY_VERSION),
        eq(legalAcceptancesTable.confirmedAge, true),
      ),
    )
    .limit(1);
  return Boolean(acceptance);
}

export function createLegalAcceptanceMiddleware(
  checkAcceptance: (userId: string) => Promise<boolean>,
) {
  return async function legalAcceptanceMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      if (!(await checkAcceptance(req.userId))) {
        res.status(428).json({
          error: "Current Terms, Privacy Policy, and 18+ confirmation are required",
          code: "LEGAL_ACCEPTANCE_REQUIRED",
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        });
        return;
      }
      next();
    } catch {
      res.status(503).json({ error: "Could not verify legal acceptance" });
    }
  };
}

export const requireCurrentLegalAcceptance =
  createLegalAcceptanceMiddleware(hasCurrentLegalAcceptance);