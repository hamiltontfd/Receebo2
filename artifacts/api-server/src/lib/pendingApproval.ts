/**
 * Turning a pending email import into a receipt: shared by the approve
 * routes (single, bulk, "Always import") and by mail sync for suppliers the
 * user set to import automatically.
 */
import { db, pendingImportsTable, receiptsTable, trialUploadsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getSubscriptionStatus, receiptCapReached } from "./subscriptionStatus";
import { accountTrialStatus, TRIAL_CAP_ERROR } from "./accountTrial";
import { pendingPurchaseType } from "./pendingImportRanking";
import type { PurchaseType } from "./purchaseType";
import { refreshWarrantyExpiries } from "./warrantyExpiryStore";

export type ApproveTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ApproveAccess =
  | { ok: true; trial: Awaited<ReturnType<typeof accountTrialStatus>> }
  | { ok: false; status: number; body: Record<string, unknown> };

/** Same entitlement rules for single and bulk approval. */
export async function checkApproveAccess(userId: string): Promise<ApproveAccess> {
  const access = await getSubscriptionStatus(userId);
  const trial = access.accessState === "account_trial" ? await accountTrialStatus(userId) : null;
  if (receiptCapReached(access) || (trial && trial.remaining < 1)) {
    return { ok: false, status: 403, body: { ...TRIAL_CAP_ERROR,
      code: receiptCapReached(access) ? "trial_exhausted" : "TRIAL_UPLOAD_LIMIT" } };
  }
  if (!access.canUseApp) {
    return { ok: false, status: 403, body: { error: "subscription_required", code: access.accessState,
      message: "Your trial has ended. Subscribe to import more receipts." } };
  }
  return { ok: true, trial };
}

/**
 * Turn one pending import into a receipt inside `tx`. The status='pending'
 * guard makes it idempotent: returns null when the row was already handled
 * (or is not the user's). Counts toward the no-card trial when `trial` is set.
 */
export async function approvePendingInTx(
  tx: ApproveTx,
  userId: string,
  id: number,
  trial: Awaited<ReturnType<typeof accountTrialStatus>>,
  categoryOverride?: string,
  purchaseTypeOverride?: PurchaseType,
) {
  const [imp] = await tx
    .update(pendingImportsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(
      and(
        eq(pendingImportsTable.id, id),
        eq(pendingImportsTable.userId, userId),
        eq(pendingImportsTable.status, "pending"),
      ),
    )
    .returning();

  if (!imp) return null;
  if (!imp.extractionData) {
    throw new Error("Pending import has no extraction data");
  }

  const data = imp.extractionData;
  // Manual choice in the sheet > stored AI/hint type > hints from the text.
  const type = purchaseTypeOverride
    ? { purchaseType: purchaseTypeOverride, purchaseTypeSource: "manual" as const }
    : pendingPurchaseType(data);
  const [created] = await tx
    .insert(receiptsTable)
    .values({
      userId,
      objectPath: imp.objectPath,
      originalFileName: imp.originalFileName,
      contentType: "application/pdf",
      status: "completed",
      merchant: data.merchant,
      purchaseDate: data.purchaseDate,
      total: data.total,
      currency: data.currency,
      category: categoryOverride ?? data.category ?? "Other",
      summary: data.summary,
      ocrText: data.ocrText,
      warranty: data.warranty,
      transactionNumber: data.transactionNumber,
      products: data.products ?? [],
      notableItems: data.notableItems ?? [],
      purchaseCountry: data.purchaseCountry,
      isOnlinePurchase: data.isOnlinePurchase,
      deliveryDate: data.deliveryDate ?? null,
      purchaseType: type.purchaseType,
      purchaseTypeSource: type.purchaseTypeSource,
    })
    .returning();
  await tx
    .update(pendingImportsTable)
    .set({ approvedReceiptId: created.id, updatedAt: new Date() })
    .where(eq(pendingImportsTable.id, imp.id));
  if (trial) {
    await tx.insert(trialUploadsTable).values({
      userId, objectPath: `${imp.provider}:${imp.id}`,
      state: "succeeded", receiptId: created.id, expiresAt: trial.trial.endsAt,
    });
  }
  return { ...created, provider: imp.provider };
}

/**
 * Approve pending imports in the given order, in one transaction, up to the
 * no-card trial's remaining slots; the rest stay pending (`skipped`).
 * Caller holds the user data lock and has checked access.
 */
export async function approvePendingBatch(
  userId: string,
  rows: ReadonlyArray<{ id: number }>,
  trial: Awaited<ReturnType<typeof accountTrialStatus>>,
  categoryFor: (id: number) => string | undefined = () => undefined,
): Promise<{ approved: Array<{ id: number; receiptId: number }>; skipped: number[] }> {
  const limit = trial ? trial.remaining : rows.length;
  const toApprove = rows.slice(0, limit);
  const skipped = rows.slice(limit).map((r) => r.id);
  const approved = await db.transaction(async (tx) => {
    const done: Array<{ id: number; receiptId: number }> = [];
    for (const row of toApprove) {
      const receipt = await approvePendingInTx(tx, userId, row.id, trial, categoryFor(row.id));
      if (receipt) done.push({ id: row.id, receiptId: receipt.id });
    }
    return done;
  });
  // Warranty end dates now (none for subscriptions/digital/tickets), not at the next daily sweep.
  for (const { receiptId } of approved) await refreshWarrantyExpiries(receiptId);
  return { approved, skipped };
}
