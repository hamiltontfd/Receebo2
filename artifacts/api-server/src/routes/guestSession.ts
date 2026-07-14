import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { guestSessionsTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/guest-session", async (req, res): Promise<void> => {
  try {
    const token = randomUUID();
    await db.insert(guestSessionsTable).values({ token });
    res.status(201).json({ guestToken: token });
  } catch (error) {
    logger.error({ error }, "Failed to create guest session");
    res.status(500).json({ error: "Failed to create guest session" });
  }
});

export default router;
