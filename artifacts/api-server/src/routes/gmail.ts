import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  gmailConnectionsTable,
  pendingImportsTable,
} from "@workspace/db";
import { eq, and, count, ne, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  buildGmailOAuthUrl,
  exchangeCodeAndStore,
  syncUserGmail,
  isGmailConfigured,
  revokeGmailAccess,
} from "../lib/gmailSync";
import { gmailLogger as logger } from "../lib/logger";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { deletePendingImportObjects } from "../lib/gmailCleanup";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { lockUserDataMutation, withUserDataLock, tryLockUserDataMutation } from "../lib/userDataLock";
import { TRIAL_CAP_ERROR } from "../lib/accountTrial";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";
import { gmailOrigin } from "../lib/gmailUrls";
import { createOAuthState, verifyAndConsumeOAuthState } from "../lib/oauthState";
import { isMailProviderEnabled } from "../lib/mailProviders/config";
import { normalizeCategory } from "../lib/categories";
import {
  pendingItemCount,
  pendingPurchaseType,
  pendingTotalsByCurrency,
  rankPendingImports,
} from "../lib/pendingImportRanking";
import { PURCHASE_TYPES, type PurchaseType } from "../lib/purchaseType";
import { refreshWarrantyExpiries } from "../lib/warrantyExpiryStore";
import { approvePendingBatch, approvePendingInTx, checkApproveAccess } from "../lib/pendingApproval";
import { loadSupplierOverview, pendingSupplierKey, type SupplierView } from "../lib/recurringSuppliers";

const router = Router();
const objectStorageService = new ObjectStorageService();

// OAuth state signing/nonces live in lib/oauthState.ts (shared with Outlook).
function buildGmailState(userId: string): string {
  return createOAuthState(userId, "gmail");
}

/**
 * Gmail is hidden behind MAIL_PROVIDERS_ENABLED (default: outlook only).
 * Connect, callback and sync answer 404 when disabled; status, disconnect
 * and the shared pending-imports queue keep working.
 */
function gmailEnabled(): boolean {
  return isMailProviderEnabled("gmail");
}

function notFound(res: import("express").Response): void {
  res.status(404).json({ error: "Not found" });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redirectUri(req: Request): string {
  return `${gmailOrigin(req)}/api/gmail/callback`;
}

function appSettingsUrl(req: Request, params: string): string {
  return `${gmailOrigin(req)}/settings${params}`;
}

// ---------------------------------------------------------------------------
// GET /gmail/status  — connection status + pending import count
// ---------------------------------------------------------------------------
router.get("/gmail/status", requireAuth, async (req, res): Promise<void> => {
  try {
    const [conn] = await db
      .select({
        gmailEmail: gmailConnectionsTable.gmailEmail,
        lastSyncedAt: gmailConnectionsTable.lastSyncedAt,
        status: gmailConnectionsTable.status,
      })
      .from(gmailConnectionsTable)
      .where(eq(gmailConnectionsTable.userId, req.userId!))
      .limit(1);

    let pendingCount = 0;
    if (conn) {
      const [row] = await db
        .select({ n: count() })
        .from(pendingImportsTable)
        .where(
          and(
            eq(pendingImportsTable.userId, req.userId!),
            eq(pendingImportsTable.status, "pending"),
          ),
        );
      pendingCount = Number(row?.n ?? 0);
    }

    res.json({
      enabled: gmailEnabled(),
      configured: isGmailConfigured(),
      connected: !!conn,
      gmailEmail: conn?.gmailEmail ?? null,
      lastSyncedAt: conn?.lastSyncedAt ?? null,
      status: conn?.status ?? null,
      needsReconnect: conn?.status === "needs_reconnect",
      pendingCount,
    });
  } catch (err) {
    logger.error({ err }, "GET /gmail/status failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------------------------------------------------------
// GET /gmail/connect  — redirect user to Google OAuth consent screen
// ---------------------------------------------------------------------------
router.get("/gmail/connect", requireAuth, requireCurrentLegalAcceptance, (req, res): void => {
  if (!gmailEnabled()) {
    notFound(res);
    return;
  }
  if (!isGmailConfigured()) {
    res.status(503).json({
      error:
        "Gmail integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
    return;
  }

  try {
    // Nonce stored server-side — validated and consumed in the callback
    const state = buildGmailState(req.userId!);
    const url = buildGmailOAuthUrl(redirectUri(req), state);
    res.redirect(url);
  } catch (err) {
    logger.error({ err }, "GET /gmail/connect failed");
    res.status(500).json({ error: "Failed to initiate Gmail connection" });
  }
});

// ---------------------------------------------------------------------------
// GET /gmail/callback  — OAuth callback (no auth middleware — Google redirects here)
// ---------------------------------------------------------------------------
router.get("/gmail/callback", async (req, res): Promise<void> => {
  if (!gmailEnabled()) {
    notFound(res);
    return;
  }
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error || !code || !state) {
    logger.warn(
      { err: { code: error }, hasCode: !!code },
      "Gmail callback: missing params or OAuth error",
    );
    res.redirect(appSettingsUrl(req, "?gmail=error"));
    return;
  }

  let userId: string;
  try {
    userId = verifyAndConsumeOAuthState(state, "gmail");
  } catch (err) {
    logger.warn({ err }, "Gmail callback: invalid or tampered state");
    res.redirect(appSettingsUrl(req, "?gmail=error"));
    return;
  }

  try {
    await withUserDataLock(userId, async () => {
      if (await isAccountDeletionInProgress(userId)) {
        throw new Error("Account deletion is in progress");
      }
      await exchangeCodeAndStore(userId, code, redirectUri(req));
    });
    // Kick off an immediate background sync — don't await
    void syncUserGmail(userId).catch((err) =>
      logger.warn({ err, userId }, "Gmail: post-connect background sync failed"),
    );
    res.redirect(appSettingsUrl(req, "?gmail=connected"));
  } catch (err) {
    logger.error({ err, userId }, "Gmail callback: token exchange failed");
    res.redirect(appSettingsUrl(req, "?gmail=error"));
  }
});

// ---------------------------------------------------------------------------
// DELETE /gmail/disconnect
// ---------------------------------------------------------------------------
router.delete("/gmail/disconnect", requireAuth, lockUserDataMutation(async (req, res): Promise<void> => {
  try {
    const removableImports = await db
      .select({
        id: pendingImportsTable.id,
        objectPath: pendingImportsTable.objectPath,
      })
      .from(pendingImportsTable)
      .where(
        and(
          eq(pendingImportsTable.userId, req.userId!),
          eq(pendingImportsTable.provider, "gmail"),
          ne(pendingImportsTable.status, "approved"),
        ),
      );

    const failedFiles = await deletePendingImportObjects(
      removableImports,
      (objectPath) => objectStorageService.deleteObject(objectPath),
      (err) => err instanceof ObjectNotFoundError,
      (pendingImport, err) => {
        logger.warn(
          {
            err,
            userId: req.userId,
            importId: pendingImport.id,
            objectPath: pendingImport.objectPath,
          },
          "Could not delete unapproved Gmail import during disconnect",
        );
      },
    );

    if (failedFiles.length > 0) {
      res.status(503).json({
        error:
          "Could not remove all unapproved Gmail files. Gmail remains connected; please try again.",
      });
      return;
    }

    const [connection] = await db
      .select()
      .from(gmailConnectionsTable)
      .where(eq(gmailConnectionsTable.userId, req.userId!))
      .limit(1);

    if (connection) {
      try {
        await revokeGmailAccess(connection);
      } catch (err) {
        logger.warn(
          { err, userId: req.userId },
          "Gmail token revocation failed; removing local credentials",
        );
      }
    }

    await db
      .delete(gmailConnectionsTable)
      .where(eq(gmailConnectionsTable.userId, req.userId!));

    // Approved imports became real receipts and retain their receipt objects.
    await db
      .delete(pendingImportsTable)
      .where(
        and(
          eq(pendingImportsTable.userId, req.userId!),
          eq(pendingImportsTable.provider, "gmail"),
          ne(pendingImportsTable.status, "approved"),
        ),
      );

    res.json({ disconnected: true });
  } catch (err) {
    logger.error({ err }, "DELETE /gmail/disconnect failed");
    res.status(500).json({ error: "Failed to disconnect Gmail" });
  }
}));

// ---------------------------------------------------------------------------
// POST /gmail/sync  — manual trigger
// ---------------------------------------------------------------------------
router.post("/gmail/sync", requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  if (!gmailEnabled()) {
    notFound(res);
    return;
  }
  try {
    const result = await syncUserGmail(req.userId!);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /gmail/sync failed");
    res.status(500).json({ error: "Sync failed" });
  }
});

// ---------------------------------------------------------------------------
// Pending imports (shared by every mail provider)
// ---------------------------------------------------------------------------
// The queue is served under /gmail/pending (legacy, mobile app) and
// /mail/pending. Items come ranked "worth keeping first" (see
// lib/pendingImportRanking.ts). The default response stays a plain array for
// the Expo app; ?meta=1 wraps it as { items, count, totals }.

type PendingImportRow = typeof pendingImportsTable.$inferSelect;

/** Hard cap on ids per bulk call: keeps the user's data lock short. */
export const MAX_BULK_PENDING_IDS = 50;

/** The supplier prompt data for one pending import (null: not a recurring supplier). */
function recurringFor(r: PendingImportRow, views?: Map<string, SupplierView>) {
  const key = views ? pendingSupplierKey(r) : null;
  const view = key ? views!.get(key) : undefined;
  if (!view) return null;
  return {
    supplierKey: view.supplierKey,
    displayName: view.displayName,
    kind: view.kind,
    category: view.category,
    status: view.status,
    /** Pending imports from this supplier, this one included. */
    pendingCount: view.pendingCount,
  };
}

function toPendingListItem(r: PendingImportRow, views?: Map<string, SupplierView>) {
  // Only what the list UI needs: never the full ocrText.
  const data = r.extractionData;
  const products = data?.products ?? [];
  return {
    id: r.id,
    provider: r.provider,
    gmailMessageId: r.gmailMessageId,
    originalFileName: r.originalFileName,
    merchant: data?.merchant ?? null,
    total: data?.total ?? null,
    currency: data?.currency ?? null,
    purchaseDate: data?.purchaseDate ?? null,
    category: data?.category ?? null,
    summary: data?.summary ?? null,
    createdAt: r.createdAt,
    itemCount: pendingItemCount(data),
    firstItemName: products[0]?.name ?? null,
    productCount: products.length,
    notableCount: data?.notableItems?.length ?? 0,
    purchaseType: pendingPurchaseType(data).purchaseType,
    recurring: recurringFor(r, views),
  };
}

async function selectUserPending(userId: string, ids?: number[]): Promise<PendingImportRow[]> {
  return db
    .select()
    .from(pendingImportsTable)
    .where(
      and(
        eq(pendingImportsTable.userId, userId),
        eq(pendingImportsTable.status, "pending"),
        ...(ids ? [inArray(pendingImportsTable.id, ids)] : []),
      ),
    );
}

/** Positive integer ids, deduplicated, 1..MAX_BULK_PENDING_IDS of them; null when invalid. */
function parseBulkIds(body: unknown): number[] | null {
  const raw = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!raw.every((id) => Number.isSafeInteger(id) && (id as number) > 0)) return null;
  const ids = [...new Set(raw as number[])];
  return ids.length <= MAX_BULK_PENDING_IDS ? ids : null;
}

/** Optional purchase type in an approve body (the sheet's subscription switch): undefined, a type, or null (invalid). */
function parsePurchaseTypeOverride(body: unknown): PurchaseType | undefined | null {
  const raw = (body as { purchaseType?: unknown } | null)?.purchaseType;
  if (raw === undefined || raw === null) return undefined;
  return (PURCHASE_TYPES as readonly unknown[]).includes(raw) ? (raw as PurchaseType) : null;
}

/** Optional category override in an approve body: undefined (none), a canonical category, or null (invalid). */
function parseCategoryOverride(body: unknown): string | undefined | null {
  const raw = (body as { category?: unknown } | null)?.category;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const normalized = normalizeCategory(raw);
  return normalized.toLowerCase() === raw.trim().toLowerCase() ? normalized : null;
}

// ---------------------------------------------------------------------------
// GET /mail/pending  — list pending imports, ranked
// ---------------------------------------------------------------------------
router.get(["/gmail/pending", "/mail/pending"], requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  try {
    const rows = rankPendingImports(await selectUserPending(req.userId!));
    const views = await loadSupplierOverview(req.userId!, rows);
    const items = rows.map((r) => toPendingListItem(r, views));
    res.setHeader("X-Pending-Count", String(items.length));
    if (req.query.meta === "1") {
      res.json({ items, count: items.length, totals: pendingTotalsByCurrency(rows) });
      return;
    }
    res.json(items);
  } catch (err) {
    logger.error({ err }, "GET /gmail/pending failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------------------------------------------------------
// GET /mail/pending/:id  — read-only details for the pending sheet
// ---------------------------------------------------------------------------
router.get(["/gmail/pending/:id", "/mail/pending/:id"], requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [row] = await selectUserPending(req.userId!, [id]);
    if (!row || !row.extractionData) {
      res.status(404).json({ error: "Pending import not found" });
      return;
    }
    // Everything the AI read except the raw transcription.
    const { ocrText: _ocrText, ...extraction } = row.extractionData;
    const views = await loadSupplierOverview(req.userId!);
    res.json({
      ...toPendingListItem(row, views),
      extraction: {
        ...extraction,
        products: extraction.products ?? [],
        notableItems: extraction.notableItems ?? [],
        deliveryDate: extraction.deliveryDate ?? null,
      },
      objectPath: row.objectPath,
      // Served by the private storage route (owner + pending check there).
      originalUrl: `/api/storage${row.objectPath}`,
    });
  } catch (err) {
    logger.error({ err }, "GET /gmail/pending/:id failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------------------------------------------------------
// POST /mail/pending/:id/approve  — move import to the receipts table
// Optional body { category } overrides the AI's suggestion.
// ---------------------------------------------------------------------------
router.post(
  ["/gmail/pending/:id/approve", "/mail/pending/:id/approve"],
  requireAuth,
  requireCurrentLegalAcceptance,
  tryLockUserDataMutation(async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const categoryOverride = parseCategoryOverride(req.body);
    if (categoryOverride === null) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    const purchaseTypeOverride = parsePurchaseTypeOverride(req.body);
    if (purchaseTypeOverride === null) {
      res.status(400).json({ error: "Invalid purchase type" });
      return;
    }

    try {
      const access = await checkApproveAccess(req.userId!);
      if (!access.ok) {
        res.status(access.status).json(access.body);
        return;
      }
      const receipt = await db.transaction((tx) =>
        approvePendingInTx(tx, req.userId!, id, access.trial, categoryOverride, purchaseTypeOverride));

      if (!receipt) {
        const [existing] = await db
          .select({
            status: pendingImportsTable.status,
            approvedReceiptId: pendingImportsTable.approvedReceiptId,
          })
          .from(pendingImportsTable)
          .where(
            and(
              eq(pendingImportsTable.id, id),
              eq(pendingImportsTable.userId, req.userId!),
            ),
          )
          .limit(1);
        if (existing?.status === "approved" && existing.approvedReceiptId) {
          res.json({ approved: true, receiptId: existing.approvedReceiptId });
          return;
        }
        res.status(existing ? 409 : 404).json({
          error: existing ? "Pending import was already handled" : "Pending import not found",
        });
        return;
      }

      // Warranty end dates now (none for subscriptions/digital/tickets), not at the next daily sweep.
      await refreshWarrantyExpiries(receipt.id);
      logger.info(
        { userId: req.userId, importId: id, receiptId: receipt.id, provider: receipt.provider },
        `${receipt.provider === "outlook" ? "Outlook" : "Gmail"} import approved`,
      );
      res.json({ approved: true, receiptId: receipt.id });
    } catch (err) {
      logger.error({ err }, "POST /gmail/pending/:id/approve failed");
      res.status(500).json({ error: "Failed to approve import" });
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /mail/pending/bulk-approve  { ids }  — one lock, one transaction
// ---------------------------------------------------------------------------
// A running sync holds the lock: the whole batch gets 409 SYNC_IN_PROGRESS and
// nothing changes. On the no-card trial only the remaining slots are approved,
// in ranking order; the rest stay pending and are listed in `skipped`.
router.post(
  "/mail/pending/bulk-approve",
  requireAuth,
  requireCurrentLegalAcceptance,
  tryLockUserDataMutation(async (req, res): Promise<void> => {
    const ids = parseBulkIds(req.body);
    if (!ids) {
      res.status(400).json({ error: `ids must be 1-${MAX_BULK_PENDING_IDS} positive integers` });
      return;
    }
    try {
      const access = await checkApproveAccess(req.userId!);
      if (!access.ok) {
        res.status(access.status).json(access.body);
        return;
      }
      const rows = rankPendingImports(await selectUserPending(req.userId!, ids));
      const { approved, skipped } = await approvePendingBatch(req.userId!, rows, access.trial);
      const handled = new Set([...approved.map((a) => a.id), ...skipped]);
      const notFound = ids.filter((id) => !handled.has(id));
      logger.info(
        { userId: req.userId, approved: approved.length, skipped: skipped.length, notFound: notFound.length },
        "Bulk import approval",
      );
      res.json({
        approved,
        skipped,
        notFound,
        ...(skipped.length > 0 ? { code: "TRIAL_UPLOAD_LIMIT", message: TRIAL_CAP_ERROR.message } : {}),
      });
    } catch (err) {
      logger.error({ err }, "POST /mail/pending/bulk-approve failed");
      res.status(500).json({ error: "Failed to approve imports" });
    }
  }),
);

/** Delete stored files first (outside any transaction), then the rows whose file is gone. */
async function dismissPendingRows(userId: string, rows: Array<{ id: number; objectPath: string }>) {
  const failed = await deletePendingImportObjects(
    rows,
    (objectPath) => objectStorageService.deleteObject(objectPath),
    (err) => err instanceof ObjectNotFoundError,
    (pendingImport, err) => {
      logger.warn(
        { err, userId, importId: pendingImport.id, objectPath: pendingImport.objectPath },
        "Could not delete dismissed mail import object",
      );
    },
  );
  const failedSet = new Set(failed);
  const removable = rows.map((r) => r.id).filter((id) => !failedSet.has(id));
  if (removable.length > 0) {
    await db
      .delete(pendingImportsTable)
      .where(
        and(
          inArray(pendingImportsTable.id, removable),
          eq(pendingImportsTable.userId, userId),
          eq(pendingImportsTable.status, "pending"),
        ),
      );
  }
  return { dismissed: removable, failed };
}

// ---------------------------------------------------------------------------
// POST /mail/pending/bulk-dismiss  { ids }
// ---------------------------------------------------------------------------
router.post(
  "/mail/pending/bulk-dismiss",
  requireAuth,
  requireCurrentLegalAcceptance,
  tryLockUserDataMutation(async (req, res): Promise<void> => {
    const ids = parseBulkIds(req.body);
    if (!ids) {
      res.status(400).json({ error: `ids must be 1-${MAX_BULK_PENDING_IDS} positive integers` });
      return;
    }
    try {
      const rows = await selectUserPending(req.userId!, ids);
      const { dismissed, failed } = await dismissPendingRows(req.userId!, rows);
      const found = new Set(rows.map((r) => r.id));
      const notFound = ids.filter((id) => !found.has(id));
      if (failed.length > 0 && dismissed.length === 0) {
        res.status(503).json({ error: "Could not remove these imports. Please try again.", failed, notFound });
        return;
      }
      res.json({ dismissed, failed, notFound });
    } catch (err) {
      logger.error({ err }, "POST /mail/pending/bulk-dismiss failed");
      res.status(500).json({ error: "Failed to dismiss imports" });
    }
  }),
);

// ---------------------------------------------------------------------------
// DELETE /gmail/pending/:id  — dismiss
// ---------------------------------------------------------------------------
router.delete(
  ["/gmail/pending/:id", "/mail/pending/:id"],
  requireAuth,
  requireCurrentLegalAcceptance,
  tryLockUserDataMutation(async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const [pendingImport] = await db
        .select({
          id: pendingImportsTable.id,
          objectPath: pendingImportsTable.objectPath,
        })
        .from(pendingImportsTable)
        .where(
          and(
            eq(pendingImportsTable.id, id),
            eq(pendingImportsTable.userId, req.userId!),
            eq(pendingImportsTable.status, "pending"),
          ),
        )
        .limit(1);

      if (!pendingImport) {
        res.status(404).json({ error: "Pending import not found" });
        return;
      }

      try {
        await objectStorageService.deleteObject(pendingImport.objectPath);
      } catch (err) {
        if (!(err instanceof ObjectNotFoundError)) {
          logger.warn(
            {
              err,
              userId: req.userId,
              importId: pendingImport.id,
              objectPath: pendingImport.objectPath,
            },
            "Could not delete dismissed Gmail import object",
          );
          res.status(503).json({
            error: "Could not remove this import. Please try again.",
          });
          return;
        }
      }

      await db
        .delete(pendingImportsTable)
        .where(
          and(
            eq(pendingImportsTable.id, id),
            eq(pendingImportsTable.userId, req.userId!),
            eq(pendingImportsTable.status, "pending"),
          ),
        );

      res.json({ dismissed: true });
    } catch (err) {
      logger.error({ err }, "DELETE /gmail/pending/:id failed");
      res.status(500).json({ error: "Failed to dismiss import" });
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /gmail/connect-url  — returns the OAuth URL as JSON for mobile clients
// Mobile apps cannot follow server-side redirects with auth headers, so this
// endpoint returns the URL as JSON so the client can open it via Linking.
// ---------------------------------------------------------------------------
router.get("/gmail/connect-url", requireAuth, requireCurrentLegalAcceptance, (req, res): void => {
  if (!gmailEnabled()) {
    notFound(res);
    return;
  }
  if (!isGmailConfigured()) {
    res.status(503).json({ error: "Gmail integration not configured." });
    return;
  }
  try {
    const state = buildGmailState(req.userId!);
    const url = buildGmailOAuthUrl(redirectUri(req), state);
    res.json({ url });
  } catch (err) {
    logger.error({ err }, "GET /gmail/connect-url failed");
    res.status(500).json({ error: "Failed to build Gmail OAuth URL" });
  }
});

export default router;
