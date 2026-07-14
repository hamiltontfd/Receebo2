import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, guestSessionsTable } from "@workspace/db";
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
    const [session] = await db
      .select()
      .from(guestSessionsTable)
      .where(eq(guestSessionsTable.token, guestToken))
      .limit(1);

    if (session) {
      (req as any).userId = guestToken;
      return next();
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}
