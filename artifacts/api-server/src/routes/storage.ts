import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { and, eq } from "drizzle-orm";
import { db, receiptsTable, receiptAttachmentsTable, uploadIntentsTable, trialUploadsTable } from "@workspace/db";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { lockUserDataMutation } from "../lib/userDataLock";
import { getSubscriptionStatus, receiptCapReached } from "../lib/subscriptionStatus";
import { reserveTrialUpload, TRIAL_CAP_ERROR } from "../lib/accountTrial";
import { aiReadCapApplies, trialAiReadsRemaining, TRIAL_AI_READS_ERROR } from "../lib/trialAiReads";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Apply even to authentication/errors. Public assets retain their own policy.
router.use(["/storage/objects", "/storage/uploads"], (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.vary("Cookie");
  res.vary("Authorization");
  res.vary("x-guest-id");
  next();
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAuthOrGuest, requireCurrentLegalAcceptance, lockUserDataMutation(async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const subscription = await getSubscriptionStatus(req.userId!);
    const attachmentReceiptId = req.body.receiptId;
    // At the receipt cap, new receipts are refused. Extra pages/attachments
    // for an existing receipt (receiptId) neither count nor run extraction.
    if (attachmentReceiptId === undefined && receiptCapReached(subscription)) {
      res.status(403).json(TRIAL_CAP_ERROR);
      return;
    }
    if (!subscription.canUseApp || (attachmentReceiptId === undefined && !subscription.canUpload)) {
      res.status(403).json({ error: "subscription_required", code: subscription.accessState,
        message: subscription.canUseApp ? "Your remaining free receipts are still processing. Try again in a moment, or subscribe to add more." :
          "Your trial has ended. Subscribe as a Founding Customer to continue." });
      return;
    }
    // Each new receipt costs one AI read; extra pages for an existing receipt don't.
    if (attachmentReceiptId === undefined && aiReadCapApplies(subscription.accessState) &&
      (await trialAiReadsRemaining(req.userId!)) < 1) {
      res.status(403).json(TRIAL_AI_READS_ERROR);
      return;
    }
    if (attachmentReceiptId !== undefined) {
      if (!Number.isSafeInteger(attachmentReceiptId)) {
        res.status(400).json({ error: "Invalid receiptId" }); return;
      }
      const [receipt] = await db.select({ id: receiptsTable.id }).from(receiptsTable)
        .where(and(eq(receiptsTable.userId, req.userId!), eq(receiptsTable.id, attachmentReceiptId)));
      if (!receipt) { res.status(404).json({ error: "Receipt not found" }); return; }
    }

    const deadline = subscription.accessState === "account_trial" && subscription.trialEndAt
      ? Math.min(Date.now() + 15 * 60 * 1000, subscription.trialEndAt.getTime())
      : Date.now() + 15 * 60 * 1000;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(Math.max(0, (deadline - Date.now()) / 1000));
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const expiresAt = new Date(deadline);
    if (subscription.accessState === "account_trial" && attachmentReceiptId === undefined) {
      await reserveTrialUpload(req.userId!, objectPath, expiresAt);
    }

    // Bind this presigned URL to the requesting user so we can verify ownership
    // when they later create a receipt or attachment referencing this objectPath.
    await db.insert(uploadIntentsTable).values({
      userId: req.userId!,
      objectPath,
      attachmentReceiptId: attachmentReceiptId ?? null,
      expiresAt,
    });

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "TRIAL_UPLOAD_LIMIT") {
      res.status(403).json({ error: "subscription_required", code: "TRIAL_UPLOAD_LIMIT",
        message: TRIAL_CAP_ERROR.message });
      return;
    }
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
}));

// Safely abandon a failed transfer. A consumed/processing/successful upload
// cannot be released or reused by this endpoint, including a lost POST response.
router.post("/storage/uploads/release", requireAuthOrGuest, lockUserDataMutation(async (req, res) => {
  if (typeof req.body.objectPath !== "string") {
    res.status(400).json({ error: "objectPath required" }); return;
  }
  await db.transaction(async tx => {
    await tx.delete(uploadIntentsTable).where(and(
      eq(uploadIntentsTable.objectPath, req.body.objectPath),
      eq(uploadIntentsTable.userId, req.userId!),
    ));
    await tx.update(trialUploadsTable).set({ state: "released" }).where(and(
      eq(trialUploadsTable.objectPath, req.body.objectPath),
      eq(trialUploadsTable.userId, req.userId!),
      eq(trialUploadsTable.state, "reserved"),
    ));
  });
  res.sendStatus(204);
}));

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Browser video controls need byte ranges for seeking. Keep this confined
    // to already-public video assets; protected receipt serving is unchanged.
    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType || "");
    const size = Number(metadata.size);
    if (contentType.startsWith("video/") && Number.isSafeInteger(size) && size > 0) {
      res.setHeader("Accept-Ranges", "bytes");
      const ranges = req.range(size);
      if (ranges === -1 || (Array.isArray(ranges) && ranges.length !== 1)) {
        res.setHeader("Content-Range", `bytes */${size}`);
        res.status(416).end();
        return;
      }
      if (Array.isArray(ranges) && ranges.type === "bytes") {
        const { start, end } = ranges[0];
        res.status(206);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        res.setHeader("Content-Length", String(end - start + 1));
        res.setHeader("Cache-Control", "public, max-age=3600");
        file.createReadStream({ start, end })
          .on("error", (error) => {
            req.log.error({ err: error }, "Error streaming public video range");
            res.destroy(error);
          })
          .pipe(res);
        return;
      }
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", requireAuthOrGuest, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Ownership check: only serve the object if it belongs to a receipt
    // (primary file or attachment) owned by the requesting user.
    const [ownedByReceipt] = await db
      .select({ id: receiptsTable.id })
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.objectPath, objectPath),
          eq(receiptsTable.userId, req.userId!),
        ),
      )
      .limit(1);

    if (!ownedByReceipt) {
      const [ownedByAttachment] = await db
        .select({ id: receiptAttachmentsTable.id })
        .from(receiptAttachmentsTable)
        .innerJoin(receiptsTable, eq(receiptAttachmentsTable.receiptId, receiptsTable.id))
        .where(
          and(
            eq(receiptAttachmentsTable.objectPath, objectPath),
            eq(receiptsTable.userId, req.userId!),
          ),
        )
        .limit(1);

      if (!ownedByAttachment) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
    }
    const access = await getSubscriptionStatus(req.userId!);
    if (!access.canUseApp && ownedByReceipt?.id !== access.reviewReceiptId) {
      res.status(403).json({ error: "subscription_required", code: access.accessState });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    // The private route is always private, regardless of an object's ACL.
    res.setHeader("Cache-Control", "private, no-store");

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
