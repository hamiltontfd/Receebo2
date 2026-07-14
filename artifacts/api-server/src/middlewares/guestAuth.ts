import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, guestSessionsTable, receiptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuthOrGuest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (clerkUserId) {
    (req as any).userId = clerkUserId;
    return next();
  }

  const guestToken = req.headers["x-guest-id"];
  if (typeof guestToken === "string" && guestToken.length > 0) {
    // Fast path: token already registered in guest_sessions (covers both server-issued
    // UUIDs and previously migrated legacy IDs)
    const [session] = await db
      .select()
      .from(guestSessionsTable)
      .where(eq(guestSessionsTable.token, guestToken))
      .limit(1);

    if (session) {
      (req as any).userId = guestToken;
      return next();
    }

    // Lazy-migration path: legacy client-generated guest-* IDs that pre-date server-issued
    // tokens. If this ID owns at least one receipt it is a real returning guest — register
    // it in guest_sessions so all future requests hit the fast path. Unknown legacy IDs
    // (no owned receipts, or a spoofed value) fall through to 401.
    if (guestToken.startsWith("guest-")) {
      const [ownerReceipt] = await db
        .select({ id: receiptsTable.id })
        .from(receiptsTable)
        .where(eq(receiptsTable.userId, guestToken))
        .limit(1);

      if (ownerReceipt) {
        await db
          .insert(guestSessionsTable)
          .values({ token: guestToken })
          .onConflictDoNothing();
        (req as any).userId = guestToken;
        return next();
      }
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}
