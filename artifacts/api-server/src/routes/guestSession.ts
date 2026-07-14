import { Router, type IRouter } from "express";
import { db, guestSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/guest-session", async (req, res): Promise<void> => {
  try {
    // Idempotent: if the client re-submits an existing token, confirm and return it
    const submitted = typeof req.body?.token === "string" ? req.body.token : null;
    if (submitted) {
      const [existing] = await db
        .select()
        .from(guestSessionsTable)
        .where(eq(guestSessionsTable.token, submitted))
        .limit(1);
      if (existing) {
        res.status(200).json({ guestToken: existing.token });
        return;
      }
    }

    const token = randomUUID();
    await db.insert(guestSessionsTable).values({ token });
    res.status(201).json({ guestToken: token });
  } catch (error) {
    logger.error({ error }, "Failed to create guest session");
    res.status(500).json({ error: "Failed to create guest session" });
  }
});

export default router;
