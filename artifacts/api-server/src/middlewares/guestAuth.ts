import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

const GUEST_ID_PREFIX = "guest-";

export function requireAuthOrGuest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (clerkUserId) {
    (req as any).userId = clerkUserId;
    return next();
  }

  const guestId = req.headers["x-guest-id"];
  if (typeof guestId === "string" && guestId.startsWith(GUEST_ID_PREFIX)) {
    (req as any).userId = guestId;
    return next();
  }

  res.status(401).json({ error: "Unauthorized" });
}
