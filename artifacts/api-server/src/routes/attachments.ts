import { Router, type IRouter } from "express";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, receiptsTable, receiptAttachmentsTable } from "@workspace/db";
import { CreateAttachmentBody, CreateAttachmentParams, DeleteAttachmentParams } from "@workspace/api-zod";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";

const objectStorageService = new ObjectStorageService();
const router: IRouter = Router();

const DAILY_UPLOAD_LIMIT = 5;

function todayMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** POST /receipts/:id/attachments */
router.post("/receipts/:id/attachments", requireAuthOrGuest, async (req, res): Promise<void> => {
  const params = CreateAttachmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateAttachmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.userId!;
  const receiptId = params.data.id;
  const midnight = todayMidnightUTC();

  // Validate that the objectPath was issued by this server (i.e. it lives under
  // the expected private uploads directory). This prevents a malicious client
  // from associating an arbitrary GCS path — potentially belonging to another
  // user — with a receipt and then reading it via the /storage/objects/* proxy.
  const expectedPrefix = `${objectStorageService.getPrivateObjectDir()}/uploads/`;
  if (!parsed.data.objectPath.startsWith(expectedPrefix)) {
    res.status(400).json({ error: "Invalid objectPath" });
    return;
  }

  // Pro / trialing users are exempt from the daily upload cap
  const subscription = await getSubscriptionStatus(userId);
  const isUnlimited = subscription.plan === "pro" || subscription.plan === "trialing";

  let attachment: (typeof receiptAttachmentsTable.$inferSelect) | undefined;
  let limitReached = false;
  let receiptNotFound = false;

  // Same advisory-lock + transaction pattern as receipt creation so that
  // primary uploads and attachment uploads share the daily cap atomically.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const [receipt] = await tx
      .select({ id: receiptsTable.id })
      .from(receiptsTable)
      .where(and(eq(receiptsTable.id, receiptId), eq(receiptsTable.userId, userId)))
      .limit(1);

    if (!receipt) {
      receiptNotFound = true;
      return;
    }

    // Count receipt uploads today
    const [receiptCountRow] = await tx
      .select({ used: count() })
      .from(receiptsTable)
      .where(and(eq(receiptsTable.userId, userId), gte(receiptsTable.createdAt, midnight)));

    // Count attachment uploads today (join to get only this user's attachments)
    const [attCountRow] = await tx
      .select({ used: count() })
      .from(receiptAttachmentsTable)
      .innerJoin(receiptsTable, eq(receiptAttachmentsTable.receiptId, receiptsTable.id))
      .where(and(eq(receiptsTable.userId, userId), gte(receiptAttachmentsTable.createdAt, midnight)));

    const totalToday = Number(receiptCountRow?.used ?? 0) + Number(attCountRow?.used ?? 0);
    if (!isUnlimited && totalToday >= DAILY_UPLOAD_LIMIT) {
      limitReached = true;
      return;
    }

    const [inserted] = await tx
      .insert(receiptAttachmentsTable)
      .values({
        receiptId,
        objectPath: parsed.data.objectPath,
        originalFileName: parsed.data.originalFileName,
        contentType: parsed.data.contentType,
      })
      .returning();

    attachment = inserted;
  });

  if (receiptNotFound) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  if (limitReached) {
    res.status(429).json({
      error: "daily_limit_reached",
      message: "You've reached your 5 upload limit for today. Come back tomorrow.",
    });
    return;
  }

  logger.info({ receiptId, attachmentId: attachment!.id }, "Attachment created");
  res.status(201).json(attachment!);
});

/** DELETE /receipts/:id/attachments/:attachmentId */
router.delete(
  "/receipts/:id/attachments/:attachmentId",
  requireAuthOrGuest,
  async (req, res): Promise<void> => {
    const params = DeleteAttachmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const userId = req.userId!;
    const { id: receiptId, attachmentId } = params.data;

    const [existing] = await db
      .select({ id: receiptAttachmentsTable.id, objectPath: receiptAttachmentsTable.objectPath })
      .from(receiptAttachmentsTable)
      .innerJoin(receiptsTable, eq(receiptAttachmentsTable.receiptId, receiptsTable.id))
      .where(
        and(
          eq(receiptAttachmentsTable.id, attachmentId),
          eq(receiptAttachmentsTable.receiptId, receiptId),
          eq(receiptsTable.userId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    try {
      await objectStorageService.deleteObject(existing.objectPath);
    } catch (err) {
      logger.warn(
        { err, attachmentId, objectPath: existing.objectPath },
        "Failed to delete attachment storage object; proceeding with DB delete",
      );
    }

    await db
      .delete(receiptAttachmentsTable)
      .where(eq(receiptAttachmentsTable.id, existing.id));

    res.sendStatus(204);
  },
);

export default router;
