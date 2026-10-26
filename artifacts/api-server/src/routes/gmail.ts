import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  gmailConnectionsTable,
  pendingImportsTable,
  receiptsTable,
} from "@workspace/db";
import { eq, and, count, ne } from "drizzle-orm";
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
import { lockUserDataMutation, withUserDataLock } from "../lib/userDataLock";
import { getSubscriptionStatus, receiptCapReached } from "../lib/subscriptionStatus";
import { accountTrialStatus, TRIAL_CAP_ERROR } from "../lib/accountTrial";
import { trialUploadsTable } from "@workspace/db";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";
import { gmailOrigin } from "../lib/gmailUrls";
import { createOAuthState, verifyAndConsumeOAuthState } from "../lib/oauthState";
import { isMailProviderEnabled } from "../lib/mailProviders/config";

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
// GET /gmail/pending  — list pending imports
// ---------------------------------------------------------------------------
// The pending-imports queue is shared by every mail provider. It is served
// under both /gmail/pending (legacy, mobile app) and /mail/pending.
router.get(["/gmail/pending", "/mail/pending"], requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(pendingImportsTable)
      .where(
        and(
          eq(pendingImportsTable.userId, req.userId!),
          eq(pendingImportsTable.status, "pending"),
        ),
      )
      .orderBy(pendingImportsTable.createdAt);

    // Expose only the fields the UI needs (avoid sending full ocrText)
    const items = rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      gmailMessageId: r.gmailMessageId,
      originalFileName: r.originalFileName,
      merchant: r.extractionData?.merchant ?? null,
      total: r.extractionData?.total ?? null,
      currency: r.extractionData?.currency ?? null,
      purchaseDate: r.extractionData?.purchaseDate ?? null,
      category: r.extractionData?.category ?? null,
      summary: r.extractionData?.summary ?? null,
      createdAt: r.createdAt,
    }));

    res.json(items);
  } catch (err) {
    logger.error({ err }, "GET /gmail/pending failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------------------------------------------------------
// POST /gmail/pending/:id/approve  — move import to the receipts table
// ---------------------------------------------------------------------------
router.post(
  ["/gmail/pending/:id/approve", "/mail/pending/:id/approve"],
  requireAuth,
  requireCurrentLegalAcceptance,
  lockUserDataMutation(async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const access = await getSubscriptionStatus(req.userId!);
      const trial = access.accessState === "account_trial" ? await accountTrialStatus(req.userId!) : null;
      if (receiptCapReached(access) || (trial && trial.remaining < 1)) {
        res.status(403).json({ ...TRIAL_CAP_ERROR,
          code: receiptCapReached(access) ? "trial_exhausted" : "TRIAL_UPLOAD_LIMIT" });
        return;
      }
      if (!access.canUseApp) {
        res.status(403).json({ error: "subscription_required", code: access.accessState,
          message: "Your trial has ended. Subscribe to import more receipts." });
        return;
      }
      const receipt = await db.transaction(async (tx) => {
        const [imp] = await tx
          .update(pendingImportsTable)
          .set({ status: "approved", updatedAt: new Date() })
          .where(
            and(
              eq(pendingImportsTable.id, id),
              eq(pendingImportsTable.userId, req.userId!),
              eq(pendingImportsTable.status, "pending"),
            ),
          )
          .returning();

        if (!imp) return null;
        if (!imp.extractionData) {
          throw new Error("Pending import has no extraction data");
        }

        const data = imp.extractionData;
        const [created] = await tx
          .insert(receiptsTable)
          .values({
            userId: req.userId!,
            objectPath: imp.objectPath,
            originalFileName: imp.originalFileName,
            contentType: "application/pdf",
            status: "completed",
            merchant: data.merchant,
            purchaseDate: data.purchaseDate,
            total: data.total,
            currency: data.currency,
            category: data.category ?? "Other",
            summary: data.summary,
            ocrText: data.ocrText,
            warranty: data.warranty,
            transactionNumber: data.transactionNumber,
            products: data.products ?? [],
            notableItems: data.notableItems ?? [],
            purchaseCountry: data.purchaseCountry,
            isOnlinePurchase: data.isOnlinePurchase,
          })
          .returning();
        await tx
          .update(pendingImportsTable)
          .set({ approvedReceiptId: created.id, updatedAt: new Date() })
          .where(eq(pendingImportsTable.id, imp.id));
        if (trial) {
          await tx.insert(trialUploadsTable).values({
            userId: req.userId!, objectPath: `${imp.provider}:${imp.id}`,
            state: "succeeded", receiptId: created.id, expiresAt: trial.trial.endsAt,
          });
        }
        return created;
      });

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

      logger.info(
        { userId: req.userId, importId: id, receiptId: receipt.id },
        "Gmail import approved",
      );
      res.json({ approved: true, receiptId: receipt.id });
    } catch (err) {
      logger.error({ err }, "POST /gmail/pending/:id/approve failed");
      res.status(500).json({ error: "Failed to approve import" });
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
  lockUserDataMutation(async (req, res): Promise<void> => {
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
