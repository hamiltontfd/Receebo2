import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, receiptsTable, receiptAttachmentsTable } from "@workspace/db";
import { CreateAttachmentBody, CreateAttachmentParams, DeleteAttachmentParams } from "@workspace/api-zod";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const objectStorageService = new ObjectStorageService();
const router: IRouter = Router();

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

  const [receipt] = await db
    .select({ id: receiptsTable.id })
    .from(receiptsTable)
    .where(and(eq(receiptsTable.id, receiptId), eq(receiptsTable.userId, userId)))
    .limit(1);

  if (!receipt) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  const [attachment] = await db
    .insert(receiptAttachmentsTable)
    .values({
      receiptId,
      objectPath: parsed.data.objectPath,
      originalFileName: parsed.data.originalFileName,
      contentType: parsed.data.contentType,
    })
    .returning();

  logger.info({ receiptId, attachmentId: attachment.id }, "Attachment created");
  res.status(201).json(attachment);
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
