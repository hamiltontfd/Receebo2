import { Router, type IRouter } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, receiptsTable, receiptAttachmentsTable, uploadIntentsTable } from "@workspace/db";
import { CreateAttachmentBody, CreateAttachmentParams, DeleteAttachmentParams } from "@workspace/api-zod";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { lockUserDataMutation } from "../lib/userDataLock";

const objectStorageService = new ObjectStorageService();
const router: IRouter = Router();

/** POST /receipts/:id/attachments */
router.post("/receipts/:id/attachments", requireAuthOrGuest, lockUserDataMutation(async (req, res): Promise<void> => {
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

  // Validate that the objectPath was issued by this server (i.e. it lives under
  // the expected private uploads directory). This prevents a malicious client
  // from associating an arbitrary GCS path — potentially belonging to another
  // user — with a receipt and then reading it via the /storage/objects/* proxy.
  const expectedPrefix = "/objects/uploads/";
  if (!parsed.data.objectPath.startsWith(expectedPrefix)) {
    res.status(400).json({ error: "Invalid objectPath" });
    return;
  }

  // Free users (no active subscription) cannot upload attachments at all
  const subscription = await getSubscriptionStatus(userId);
  if (subscription.plan === "free") {
    res.status(403).json({
      error: "subscription_required",
      message: "An active subscription is required to upload attachments.",
    });
    return;
  }

  let attachment: (typeof receiptAttachmentsTable.$inferSelect) | undefined;
  let receiptNotFound = false;
  let intentMissing = false;

  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .select({ id: receiptsTable.id })
      .from(receiptsTable)
      .where(and(eq(receiptsTable.id, receiptId), eq(receiptsTable.userId, userId)))
      .limit(1);

    if (!receipt) {
      receiptNotFound = true;
      return;
    }

    // Verify the objectPath was issued by this server to this user.
    // Atomically consume the intent so it cannot be reused.
    const [intent] = await tx
      .delete(uploadIntentsTable)
      .where(
        and(
          eq(uploadIntentsTable.userId, userId),
          eq(uploadIntentsTable.objectPath, parsed.data.objectPath),
          gt(uploadIntentsTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: uploadIntentsTable.id });

    if (!intent) {
      intentMissing = true;
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

  if (intentMissing) {
    res.status(403).json({ error: "Invalid or expired upload path" });
    return;
  }

  logger.info({ receiptId, attachmentId: attachment!.id }, "Attachment created");
  res.status(201).json(attachment!);
}));

/** DELETE /receipts/:id/attachments/:attachmentId */
router.delete(
  "/receipts/:id/attachments/:attachmentId",
  requireAuthOrGuest,
  lockUserDataMutation(async (req, res): Promise<void> => {
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
  }),
);

export default router;
