import { db, receiptsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { checkIsReceipt, extractReceiptData, type ExtractedProduct } from "./receiptExtraction";
import { logger } from "./logger";
import { isAccountDeletionInProgress } from "./accountDeletionState";
import { withUserDataLock } from "./userDataLock";
import { finishTrialUpload } from "./accountTrial";

function deduplicateProducts(products: ExtractedProduct[]): ExtractedProduct[] {
  const seen = new Map<string, ExtractedProduct>();
  for (const product of products) {
    const normalizedName = product.name.trim().toLowerCase();
    const key = `${normalizedName}::${product.price ?? "null"}`;
    if (!seen.has(key)) {
      seen.set(key, product);
    } else {
      const existing = seen.get(key)!;
      if (
        product.quantity != null &&
        product.quantity > 1 &&
        existing.quantity != null &&
        existing.quantity > 1
      ) {
        seen.set(key, { ...existing, quantity: existing.quantity + product.quantity });
      }
    }
  }
  return Array.from(seen.values());
}

const MAX_ATTEMPTS = 3;
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 60 * 1000;

export interface ExtractionJob {
  userId: string;
  receiptId: number;
  objectPath: string;
  contentType: string;
}

const activeJobs = new Map<number, boolean>();

async function rejectReceipt(receiptId: number, objectPath: string, status: "failed" | "not_a_receipt") {
  await db.transaction(async tx => {
    await tx.update(receiptsTable).set({ status }).where(eq(receiptsTable.id, receiptId));
    await finishTrialUpload(objectPath, false, receiptId, tx);
  });
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 16000);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJobUnlocked(job: ExtractionJob, attempt: number): Promise<void> {
  const { receiptId, objectPath, contentType } = job;
  logger.info({ receiptId, attempt }, "Extraction job starting");

  try {
    // Fast pre-check: cheap AI call that only answers "is this a receipt?"
    // Returns in ~1-2s, avoiding the expensive full extraction for non-receipts.
    const isReceipt = await checkIsReceipt(objectPath, contentType);
    if (!isReceipt) {
      logger.info({ receiptId }, "Pre-check determined image is not a receipt");
      await rejectReceipt(receiptId, objectPath, "not_a_receipt");
      activeJobs.delete(receiptId);
      return;
    }

    const data = await extractReceiptData(objectPath, contentType);

    // Fallback guard: if the full extraction still returns isReceipt:false
    // (pre-check false positive), reject cleanly rather than writing null fields.
    if (!data.isReceipt) {
      logger.info({ receiptId }, "Full extraction confirmed image is not a receipt");
      await rejectReceipt(receiptId, objectPath, "not_a_receipt");
      activeJobs.delete(receiptId);
      return;
    }

    const deduplicatedProducts = deduplicateProducts(data.products);

    if (deduplicatedProducts.length < data.products.length) {
      logger.info(
        { receiptId, original: data.products.length, deduped: deduplicatedProducts.length },
        "Deduplicated products from extraction result",
      );
    }

    await db.transaction(async tx => {
    await tx
      .update(receiptsTable)
      .set({
        status: "completed",
        merchant: data.merchant,
        purchaseDate: data.purchaseDate,
        total: data.total,
        currency: data.currency,
        category: data.category,
        summary: data.summary,
        ocrText: data.ocrText,
        warranty: data.warranty,
        transactionNumber: data.transactionNumber,
        products: deduplicatedProducts,
        notableItems: data.notableItems,
        purchaseCountry: data.purchaseCountry,
        isOnlinePurchase: data.isOnlinePurchase,
      })
      .where(eq(receiptsTable.id, receiptId));
    await finishTrialUpload(objectPath, true, receiptId, tx);
    });
    logger.info({ receiptId, attempt }, "Extraction job completed");

    activeJobs.delete(receiptId);
  } catch (error) {
    logger.error({ error, receiptId, attempt }, "Extraction job attempt failed");

    if (attempt + 1 < MAX_ATTEMPTS) {
      const delay = backoffMs(attempt);
      logger.info({ receiptId, attempt, delay }, "Scheduling extraction retry");
      await sleep(delay);
      await processJobUnlocked(job, attempt + 1);
    } else {
      logger.error(
        { receiptId, attempt },
        "Extraction job exhausted all attempts, marking receipt as failed",
      );
      try {
        await rejectReceipt(receiptId, objectPath, "failed");
      } catch (dbError) {
        logger.error({ dbError, receiptId }, "Failed to mark receipt as failed in DB");
      }
      activeJobs.delete(receiptId);
    }
  }
}

export async function runDeletionAwareExtraction(
  userId: string,
  operation: () => Promise<void>,
): Promise<boolean> {
  return withUserDataLock(userId, async () => {
    if (await isAccountDeletionInProgress(userId)) {
      return false;
    }
    await operation();
    return true;
  });
}

async function processJob(job: ExtractionJob, attempt: number): Promise<void> {
  const processed = await runDeletionAwareExtraction(job.userId, async () => {
    const [current] = await db.select({ status: receiptsTable.status })
      .from(receiptsTable).where(eq(receiptsTable.id, job.receiptId));
    // A watchdog or manual acceptance may have resolved a queued job before
    // this worker obtained the lock. Never revive a released quota entry.
    if (current && current.status !== "processing") {
      activeJobs.delete(job.receiptId);
      return;
    }
    await processJobUnlocked(job, attempt);
  });
  if (!processed) {
    logger.info(
      { receiptId: job.receiptId, userId: job.userId },
      "Extraction skipped because account deletion is in progress",
    );
    activeJobs.delete(job.receiptId);
  }
}

export function enqueueExtraction(job: ExtractionJob): void {
  if (activeJobs.has(job.receiptId)) {
    logger.warn({ receiptId: job.receiptId }, "Extraction job already in progress, skipping duplicate");
    return;
  }

  activeJobs.set(job.receiptId, true);

  void processJob(job, 0);
}

async function runWatchdog(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  try {
    const stuck = await db
      .select()
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.status, "processing"),
          lt(receiptsTable.createdAt, cutoff),
        ),
      );
    for (const receipt of stuck) {
      await withUserDataLock(receipt.userId, async () => {
        const [current] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receipt.id));
        if (current?.status === "processing") {
          await rejectReceipt(current.id, current.objectPath, "failed");
        }
      });
    }
  } catch (error) {
    logger.error({ error }, "Watchdog run failed");
  }
}

let watchdogTimer: ReturnType<typeof setInterval> | null = null;

export function startExtractionWatchdog(): void {
  if (watchdogTimer) return;

  void runWatchdog();

  watchdogTimer = setInterval(() => {
    void runWatchdog();
  }, WATCHDOG_INTERVAL_MS);

  if (watchdogTimer.unref) {
    watchdogTimer.unref();
  }

  logger.info({ intervalMs: WATCHDOG_INTERVAL_MS }, "Extraction watchdog started");
}

export function stopExtractionWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}
