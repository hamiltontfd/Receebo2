/**
 * Provider-neutral email import pipeline (Gmail, Outlook, ...).
 *
 * For each candidate message (last 90 days, receipt-like):
 *   - skip if already recorded in gmail_seen_messages for this provider;
 *   - PDF attachments → upload, AI extraction, pending import (same as the
 *     original Gmail logic);
 *   - no PDF but the sender/subject look like an order or receipt → convert
 *     the HTML body to text, AI extraction from text, render a text PDF as
 *     proof of purchase, pending import;
 *   - message IDs are marked seen only after every part reached a durable
 *     outcome, so transient failures retry on the next sync.
 *
 * Dedupe key: (user, provider, message id, attachment id | "body:html").
 */
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  gmailSeenMessagesTable,
  pendingImportsTable,
  type PendingImportExtractionData,
} from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import {
  ObjectNotFoundError,
  ObjectStorageService,
  objectStorageClient,
} from "./objectStorage";
import {
  extractReceiptData,
  extractReceiptDataFromText,
  precheckEmailIsReceipt,
  type ExtractedReceipt,
} from "./receiptExtraction";
import { isAccountDeletionInProgress } from "./accountDeletionState";
import { withUserDataLock } from "./userDataLock";
import { planMessageImport } from "./mailProviders/candidates";
import { isEverydayMerchantName } from "./mailProviders/merchants";
import { aiReadCapApplies, claimTrialAiRead, trialAiReadsRemaining } from "./trialAiReads";
import { renderTextPdf } from "./textPdf";
import { clearMailImportFailure, failureText, recordMailImportFailure } from "./mailImportFailures";
import type { MailMessage, MailProvider } from "./mailProviders/types";

export const HTML_BODY_ATTACHMENT_ID = "body:html";
/** Cost guard: max AI extractions of email bodies per mailbox per run. */
export const MAX_BODY_EXTRACTIONS_PER_RUN = 25;
/** Cheap pre-checks per run; past this, remaining email bodies wait for the next run. */
export const MAX_PRECHECKS_PER_RUN = 100;

const objectStorageService = new ObjectStorageService();

export interface MailSyncResult {
  checked: number;
  queued: number;
}

async function cleanupSyncObject(
  provider: MailProvider,
  userId: string,
  objectPath: string,
  reason: string,
): Promise<void> {
  try {
    await objectStorageService.deleteObject(objectPath);
  } catch (err) {
    if (!(err instanceof ObjectNotFoundError)) {
      provider.logger.error(
        { err, userId, objectPath, reason },
        `${provider.label} sync could not clean an uploaded object`,
      );
    }
  }
}

/**
 * Upload a PDF buffer directly to GCS using the same path conventions as
 * user-uploaded receipts. Returns the `/objects/uploads/{uuid}` path.
 */
export async function uploadPdfToStorage(buffer: Buffer): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");

  const parts = privateDir.replace(/^\//, "").split("/");
  const bucketName = parts[0]!;
  const dirPrefix = parts.slice(1).join("/");

  const uuid = randomUUID();
  const objectName =
    (dirPrefix ? dirPrefix.replace(/\/$/, "") + "/" : "") +
    "uploads/" +
    uuid;

  const bucket = objectStorageClient.bucket(bucketName);
  await bucket.file(objectName).save(buffer, {
    contentType: "application/pdf",
    resumable: false,
  });

  return `/objects/uploads/${uuid}`;
}

function toPendingExtractionData(
  extraction: ExtractedReceipt,
): PendingImportExtractionData {
  return {
    merchant: extraction.merchant,
    purchaseDate: extraction.purchaseDate,
    total: extraction.total,
    currency: extraction.currency,
    category: extraction.category,
    summary: extraction.summary,
    ocrText: extraction.ocrText,
    warranty: extraction.warranty,
    transactionNumber: extraction.transactionNumber,
    products: extraction.products,
    notableItems: extraction.notableItems,
    purchaseCountry: extraction.purchaseCountry,
    isOnlinePurchase: extraction.isOnlinePurchase,
    deliveryDate: extraction.deliveryDate,
  };
}

/**
 * Groceries, utilities and other everyday bills are not imported even when
 * the AI says they are receipts (the sender filter catches most before AI).
 */
export function isEverydayExtraction(extraction: Pick<ExtractedReceipt, "category" | "merchant">): boolean {
  return extraction.category === "Groceries" || isEverydayMerchantName(extraction.merchant);
}

/**
 * A purchase can't happen after the email that reports it was received. When
 * the AI returns a later date (typically a bill's due date), use the date the
 * email was received instead (close to the issue date).
 */
export function clampPurchaseDateToReceived(
  purchaseDate: string | null,
  receivedAt: string | null,
): string | null {
  if (!purchaseDate || !receivedAt) return purchaseDate;
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime())) return purchaseDate;
  const receivedDay = received.toISOString().slice(0, 10);
  return purchaseDate > receivedDay ? receivedDay : purchaseDate;
}

/**
 * A delivery date later than the email is only an estimate ("arrives by…"),
 * so it is dropped; the return window then counts from the purchase date.
 */
export function deliveredByReceived(deliveryDate: string | null, receivedAt: string | null): string | null {
  if (!deliveryDate || !receivedAt) return deliveryDate;
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime())) return deliveryDate;
  return deliveryDate > received.toISOString().slice(0, 10) ? null : deliveryDate;
}

/** Plain-text proof-of-purchase document for HTML-body imports. */
export function buildEmailProofText(message: MailMessage, bodyText: string): string {
  return [
    "Email receipt saved by Receebo",
    message.from ? `From: ${message.from}` : null,
    message.subject ? `Subject: ${message.subject}` : null,
    message.receivedAt ? `Received: ${message.receivedAt}` : null,
    "",
    bodyText,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function emailProofFileName(message: MailMessage): string {
  const base = (message.subject ?? "email receipt")
    .replace(/[^\p{L}\p{N} _.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "email receipt"}.pdf`;
}

async function markSeen(provider: MailProvider, userId: string, messageId: string) {
  await db
    .insert(gmailSeenMessagesTable)
    .values({ userId, provider: provider.id, gmailMessageId: messageId })
    .onConflictDoNothing();
}

type ClaimOutcome =
  | { kind: "claimed"; id: number; claimToken: string }
  | { kind: "busy"; retryable: boolean };

async function claimImport(
  provider: MailProvider,
  userId: string,
  messageId: string,
  attachmentId: string,
  filename: string,
): Promise<ClaimOutcome> {
  const claimToken = randomUUID();
  let [claim] = await db
    .insert(pendingImportsTable)
    .values({
      userId,
      provider: provider.id,
      gmailMessageId: messageId,
      gmailAttachmentId: attachmentId,
      claimToken,
      objectPath: "",
      originalFileName: filename,
      status: "processing",
    })
    .onConflictDoNothing()
    .returning({ id: pendingImportsTable.id });
  if (!claim) {
    const staleBefore = new Date(Date.now() - 60 * 60 * 1000);
    [claim] = await db
      .update(pendingImportsTable)
      .set({ claimToken, updatedAt: new Date() })
      .where(
        and(
          eq(pendingImportsTable.userId, userId),
          eq(pendingImportsTable.provider, provider.id),
          eq(pendingImportsTable.gmailMessageId, messageId),
          eq(pendingImportsTable.gmailAttachmentId, attachmentId),
          eq(pendingImportsTable.status, "processing"),
          lt(pendingImportsTable.updatedAt, staleBefore),
        ),
      )
      .returning({ id: pendingImportsTable.id });
  }
  if (claim) return { kind: "claimed", id: claim.id, claimToken };

  const [existingClaim] = await db
    .select({ status: pendingImportsTable.status })
    .from(pendingImportsTable)
    .where(
      and(
        eq(pendingImportsTable.userId, userId),
        eq(pendingImportsTable.gmailMessageId, messageId),
        eq(pendingImportsTable.gmailAttachmentId, attachmentId),
      ),
    )
    .limit(1);
  return {
    kind: "busy",
    retryable: !existingClaim || existingClaim.status === "processing",
  };
}

/**
 * Sync one user's mailbox for one provider. Caller must hold the user data
 * lock (see syncUserMailbox).
 */
export async function syncMailboxClaimed(
  userId: string,
  provider: MailProvider,
  options: { aiReadCap?: boolean } = {},
): Promise<MailSyncResult> {
  const logger = provider.logger;
  const label = provider.label;
  // No-card trials have a fixed AI read budget shared with uploads.
  const aiReadCap = options.aiReadCap ?? aiReadCapApplies(
    (await (await import("./subscriptionStatus")).getSubscriptionStatus(userId)).accessState,
  );

  if (await isAccountDeletionInProgress(userId)) {
    logger.info(
      { userId },
      `${label} sync skipped because account deletion is in progress`,
    );
    return { checked: 0, queued: 0 };
  }

  const accessToken = await provider.getAccessToken(userId);
  if (!accessToken) return { checked: 0, queued: 0 };

  let messageIds: string[];
  try {
    messageIds = await provider.listCandidateMessageIds(accessToken);
  } catch (err) {
    logger.error({ err, userId }, `${label} sync: failed to list messages`);
    throw new Error(`Failed to list ${label} messages`, { cause: err });
  }

  let checked = 0;
  let queued = 0;
  let bodyExtractions = 0;
  let prechecks = 0;

  for (const messageId of messageIds) {
    const [alreadySeen] = await db
      .select({ id: gmailSeenMessagesTable.id })
      .from(gmailSeenMessagesTable)
      .where(
        and(
          eq(gmailSeenMessagesTable.userId, userId),
          eq(gmailSeenMessagesTable.provider, provider.id),
          eq(gmailSeenMessagesTable.gmailMessageId, messageId),
        ),
      )
      .limit(1);
    if (alreadySeen) continue;

    checked++;
    let retryableFailure = false;
    /** Set with retryableFailure for real failures (not deferrals): counts toward MAX_IMPORT_ATTEMPTS. */
    let failure: string | null = null;

    let message: MailMessage | null;
    try {
      message = await provider.getMessage(accessToken, messageId);
    } catch (err) {
      logger.warn({ err, messageId, userId }, `${label} sync: failed to fetch message`);
      continue;
    }

    if (!message) {
      await markSeen(provider, userId, messageId);
      continue;
    }

    const plan = planMessageImport(message);
    if (plan.kind === "skip") {
      await markSeen(provider, userId, messageId);
      continue;
    }

    // Each unit is one PDF attachment or the HTML body.
    const units =
      plan.kind === "pdf"
        ? plan.attachments.map((a) => ({ kind: "pdf" as const, attachmentId: a.id, filename: a.filename || "receipt.pdf" }))
        : [{ kind: "html" as const, attachmentId: HTML_BODY_ATTACHMENT_ID, filename: emailProofFileName(message), text: plan.text }];

    for (const unit of units) {
      if (await isAccountDeletionInProgress(userId)) {
        return { checked, queued };
      }

      if (aiReadCap && (await trialAiReadsRemaining(userId)) < 1) {
        // Trial AI budget used up: stop before spending anything else. The
        // message stays unseen so it can be imported after subscribing.
        logger.info({ userId }, `${label} sync: trial AI read limit reached, stopping`);
        await provider.markSynced(userId);
        return { checked, queued };
      }

      if (unit.kind === "html" && bodyExtractions >= MAX_BODY_EXTRACTIONS_PER_RUN) {
        // Leave for the next run instead of spending more AI calls now.
        retryableFailure = true;
        continue;
      }

      if (unit.kind === "html") {
        // Cheap yes/no screen before the full extraction. It is not a trial AI
        // read (about 50x cheaper); the full extraction below still is.
        if (prechecks >= MAX_PRECHECKS_PER_RUN) {
          retryableFailure = true;
          continue;
        }
        prechecks++;
        const likely = await precheckEmailIsReceipt(unit.text, {
          subject: message.subject,
          from: message.from,
        });
        if (!likely) {
          logger.info({ messageId }, `${label} sync: pre-check says email body is not a receipt, skipping`);
          continue;
        }
      }

      const claim = await claimImport(provider, userId, messageId, unit.attachmentId, unit.filename);
      if (claim.kind === "busy") {
        if (claim.retryable) retryableFailure = true;
        continue;
      }
      const ownedClaim = and(
        eq(pendingImportsTable.id, claim.id),
        eq(pendingImportsTable.claimToken, claim.claimToken),
      );

      let objectPath: string | null = null;
      let extraction: ExtractedReceipt;

      if (unit.kind === "pdf") {
        let pdfBuffer: Buffer;
        try {
          pdfBuffer = await provider.downloadAttachment(accessToken, messageId, unit.attachmentId);
        } catch (err) {
          logger.warn(
            { err, messageId, attachmentId: unit.attachmentId },
            `${label} sync: attachment download failed`,
          );
          retryableFailure = true;
          failure = failureText(err);
          await db.delete(pendingImportsTable).where(ownedClaim);
          continue;
        }

        try {
          objectPath = await uploadPdfToStorage(pdfBuffer);
        } catch (err) {
          logger.error({ err, userId }, `${label} sync: storage upload failed`);
          retryableFailure = true;
          failure = failureText(err);
          await db.delete(pendingImportsTable).where(ownedClaim);
          continue;
        }

        if (await isAccountDeletionInProgress(userId)) {
          await cleanupSyncObject(provider, userId, objectPath, "account deletion began");
          return { checked, queued };
        }

        if (aiReadCap && !(await claimTrialAiRead(userId, "email", messageId))) {
          await cleanupSyncObject(provider, userId, objectPath, "trial AI read limit");
          await db.delete(pendingImportsTable).where(ownedClaim);
          await provider.markSynced(userId);
          return { checked, queued };
        }
        try {
          extraction = await extractReceiptData(objectPath, "application/pdf");
        } catch (err) {
          logger.warn({ err, objectPath }, `${label} sync: extraction failed`);
          retryableFailure = true;
          failure = failureText(err);
          await cleanupSyncObject(provider, userId, objectPath, "extraction failed");
          await db.delete(pendingImportsTable).where(ownedClaim);
          continue;
        }
      } else {
        if (aiReadCap && !(await claimTrialAiRead(userId, "email", messageId))) {
          await db.delete(pendingImportsTable).where(ownedClaim);
          await provider.markSynced(userId);
          return { checked, queued };
        }
        bodyExtractions++;
        try {
          extraction = await extractReceiptDataFromText(unit.text, {
            subject: message.subject,
            from: message.from,
            receivedAt: message.receivedAt,
          });
        } catch (err) {
          logger.warn({ err, messageId }, `${label} sync: body extraction failed`);
          retryableFailure = true;
          failure = failureText(err);
          await db.delete(pendingImportsTable).where(ownedClaim);
          continue;
        }
      }

      const everyday = extraction.isReceipt && isEverydayExtraction(extraction);
      if (!extraction.isReceipt || everyday) {
        logger.info(
          { messageId, source: unit.kind, everyday },
          `${label} sync: ${unit.kind === "pdf" ? "PDF" : "email body"} is ${everyday ? "a grocery/utility bill" : "not a receipt"}, skipping`,
        );
        if (objectPath) await cleanupSyncObject(provider, userId, objectPath, "not a receipt");
        const [deletedClaim] = await db
          .delete(pendingImportsTable)
          .where(ownedClaim)
          .returning({ id: pendingImportsTable.id });
        if (!deletedClaim) retryableFailure = true;
        continue;
      }

      extraction = {
        ...extraction,
        purchaseDate: clampPurchaseDateToReceived(extraction.purchaseDate, message.receivedAt),
        deliveryDate: deliveredByReceived(extraction.deliveryDate, message.receivedAt),
      };

      if (unit.kind === "html") {
        try {
          objectPath = await uploadPdfToStorage(
            renderTextPdf(buildEmailProofText(message, unit.text)),
          );
        } catch (err) {
          logger.error({ err, userId }, `${label} sync: storage upload failed`);
          retryableFailure = true;
          failure = failureText(err);
          await db.delete(pendingImportsTable).where(ownedClaim);
          continue;
        }
      }
      const storedPath = objectPath!;

      try {
        if (await isAccountDeletionInProgress(userId)) {
          await cleanupSyncObject(provider, userId, storedPath, "account deletion began");
          await db.delete(pendingImportsTable).where(ownedClaim);
          return { checked, queued };
        }

        const [queuedImport] = await db
          .update(pendingImportsTable)
          .set({
            objectPath: storedPath,
            status: "pending",
            updatedAt: new Date(),
            extractionData: toPendingExtractionData(extraction),
          })
          .where(ownedClaim)
          .returning({ id: pendingImportsTable.id });
        if (!queuedImport) {
          retryableFailure = true;
          await cleanupSyncObject(provider, userId, storedPath, "lost claim");
          continue;
        }
        queued++;
        logger.info(
          { userId, messageId, source: unit.kind },
          `${label} sync: receipt queued as pending import`,
        );
      } catch (err) {
        logger.error({ err, userId }, `${label} sync: failed to store pending import`);
        retryableFailure = true;
        failure = failureText(err);
        await cleanupSyncObject(provider, userId, storedPath, "database update failed");
        await db.delete(pendingImportsTable).where(ownedClaim);
      }
    }

    if (!retryableFailure) {
      await markSeen(provider, userId, messageId);
      await clearMailImportFailure(userId, provider.id, messageId);
    } else if (failure) {
      const { attempts, failed } = await recordMailImportFailure(userId, provider.id, messageId, failure);
      if (failed) {
        // Stop retrying: no more AI spent on this message (and no pending item).
        await markSeen(provider, userId, messageId);
        logger.warn({ userId, messageId, attempts }, `${label} sync: message failed ${attempts} times, giving up`);
      } else {
        logger.warn({ userId, messageId, attempts }, `${label} sync: message left retryable after transient failure`);
      }
    } else {
      logger.info({ userId, messageId }, `${label} sync: message deferred to the next run`);
    }
  }

  await provider.markSynced(userId);
  logger.info({ userId, checked, queued }, `${label} sync complete`);
  return { checked, queued };
}

/** Lock the user's data, check upload access, then sync one provider. */
export async function syncUserMailbox(
  userId: string,
  provider: MailProvider,
): Promise<MailSyncResult> {
  return withUserDataLock(userId, async () => {
    const { getSubscriptionStatus } = await import("./subscriptionStatus");
    const access = await getSubscriptionStatus(userId);
    if (!access.canUpload) return { checked: 0, queued: 0 };
    return syncMailboxClaimed(userId, provider, { aiReadCap: aiReadCapApplies(access.accessState) });
  });
}
