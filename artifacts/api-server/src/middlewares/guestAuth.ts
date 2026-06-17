import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

const GUEST_ID_PREFIX = "guest-";

export function requireAuthOrGuest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.headers["x-guest-id"];
  if (typeof userId === "string" && userId.startsWith(GUEST_ID_PREFIX)) {
    (req as any).userId = userId;
    return next();
  }

  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (clerkUserId) {
    (req as any).userId = clerkUserId;
    return next();
  }

  res.status(401).json({ error: "Unauthorized" });
}
