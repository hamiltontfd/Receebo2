import { Router, type Request, type Response } from "express";
import { db, pendingImportsTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { lockUserDataMutation, withUserDataLock } from "../lib/userDataLock";
import { isAccountDeletionInProgress } from "../lib/accountDeletionState";
import { outlookLogger as logger } from "../lib/logger";
import { gmailOrigin } from "../lib/gmailUrls";
import { createOAuthState, verifyAndConsumeOAuthState } from "../lib/oauthState";
import { isMailProviderEnabled } from "../lib/mailProviders/config";
import { MailReconnectRequiredError } from "../lib/mailProviders/types";
import { buildOutlookAuthUrl, getOutlookConfig } from "../lib/outlookGraph";
import {
  deleteOutlookConnection,
  exchangeOutlookCodeAndStore,
  getOutlookConnection,
  isOutlookConfigured,
  syncUserOutlook,
} from "../lib/outlookSync";
import { deletePendingImportObjects } from "../lib/gmailCleanup";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

// Same canonical-origin rules as Gmail: receebo.net in production, the
// Replit dev domain in development. Must match the Entra redirect URIs.
function redirectUri(req: Request): string {
  return `${gmailOrigin(req)}/api/outlook/callback`;
}

function appSettingsUrl(req: Request, params: string): string {
  return `${gmailOrigin(req)}/settings${params}`;
}

function outlookEnabled(): boolean {
  return isMailProviderEnabled("outlook");
}

function notFound(res: Response): void {
  res.status(404).json({ error: "Not found" });
}

function buildAuthUrl(req: Request): string {
  const config = getOutlookConfig();
  if (!config) throw new Error("Outlook not configured");
  const state = createOAuthState(req.userId!, "outlook");
  return buildOutlookAuthUrl(config, redirectUri(req), state);
}

// GET /outlook/status
router.get("/outlook/status", requireAuth, async (req, res): Promise<void> => {
  try {
    const conn = await getOutlookConnection(req.userId!);
    res.json({
      enabled: outlookEnabled(),
      configured: isOutlookConfigured(),
      connected: !!conn,
      accountEmail: conn?.accountEmail ?? null,
      lastSyncedAt: conn?.lastSyncedAt ?? null,
      status: conn?.status ?? null,
      needsReconnect: conn?.status === "needs_reconnect",
    });
  } catch (err) {
    logger.error({ err }, "GET /outlook/status failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /outlook/connect-url — JSON URL (works with service workers and mobile)
router.get("/outlook/connect-url", requireAuth, requireCurrentLegalAcceptance, (req, res): void => {
  if (!outlookEnabled()) {
    notFound(res);
    return;
  }
  if (!isOutlookConfigured()) {
    res.status(503).json({ error: "Outlook integration not configured." });
    return;
  }
  try {
    res.json({ url: buildAuthUrl(req) });
  } catch (err) {
    logger.error({ err }, "GET /outlook/connect-url failed");
    res.status(500).json({ error: "Failed to build Outlook sign-in URL" });
  }
});

// GET /outlook/connect — redirect to Microsoft sign-in
router.get("/outlook/connect", requireAuth, requireCurrentLegalAcceptance, (req, res): void => {
  if (!outlookEnabled()) {
    notFound(res);
    return;
  }
  if (!isOutlookConfigured()) {
    res.status(503).json({ error: "Outlook integration not configured." });
    return;
  }
  try {
    res.redirect(buildAuthUrl(req));
  } catch (err) {
    logger.error({ err }, "GET /outlook/connect failed");
    res.status(500).json({ error: "Failed to initiate Outlook connection" });
  }
});

// GET /outlook/callback — Microsoft redirects here (no auth middleware)
router.get("/outlook/callback", async (req, res): Promise<void> => {
  if (!outlookEnabled() || !isOutlookConfigured()) {
    notFound(res);
    return;
  }
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error || !code || !state) {
    logger.warn(
      { err: { code: error }, hasCode: !!code },
      "Outlook callback: missing params or OAuth error",
    );
    res.redirect(appSettingsUrl(req, "?outlook=error"));
    return;
  }

  let userId: string;
  try {
    userId = verifyAndConsumeOAuthState(state, "outlook");
  } catch (err) {
    logger.warn({ err }, "Outlook callback: invalid or tampered state");
    res.redirect(appSettingsUrl(req, "?outlook=error"));
    return;
  }

  try {
    await withUserDataLock(userId, async () => {
      if (await isAccountDeletionInProgress(userId)) {
        throw new Error("Account deletion is in progress");
      }
      await exchangeOutlookCodeAndStore(userId, code, redirectUri(req));
    });
    void syncUserOutlook(userId).catch((err) =>
      logger.warn({ err, userId }, "Outlook: post-connect background sync failed"),
    );
    res.redirect(appSettingsUrl(req, "?outlook=connected"));
  } catch (err) {
    logger.error({ err, userId }, "Outlook callback: token exchange failed");
    res.redirect(appSettingsUrl(req, "?outlook=error"));
  }
});

// POST /outlook/sync — manual trigger
router.post("/outlook/sync", requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  if (!outlookEnabled() || !isOutlookConfigured()) {
    notFound(res);
    return;
  }
  try {
    res.json(await syncUserOutlook(req.userId!));
  } catch (err) {
    if (err instanceof MailReconnectRequiredError) {
      res.status(409).json({ error: "needs_reconnect", provider: "outlook" });
      return;
    }
    logger.error({ err }, "POST /outlook/sync failed");
    res.status(500).json({ error: "Sync failed" });
  }
});

// DELETE /outlook/disconnect — always available so credentials can be removed
router.delete("/outlook/disconnect", requireAuth, lockUserDataMutation(async (req, res): Promise<void> => {
  try {
    const removableImports = await db
      .select({ id: pendingImportsTable.id, objectPath: pendingImportsTable.objectPath })
      .from(pendingImportsTable)
      .where(
        and(
          eq(pendingImportsTable.userId, req.userId!),
          eq(pendingImportsTable.provider, "outlook"),
          ne(pendingImportsTable.status, "approved"),
        ),
      );

    const failedFiles = await deletePendingImportObjects(
      removableImports.filter((row) => row.objectPath),
      (objectPath) => objectStorageService.deleteObject(objectPath),
      (err) => err instanceof ObjectNotFoundError,
      (pendingImport, err) => {
        logger.warn(
          { err, userId: req.userId, importId: pendingImport.id },
          "Could not delete unapproved Outlook import during disconnect",
        );
      },
    );
    if (failedFiles.length > 0) {
      res.status(503).json({
        error: "Could not remove all unapproved Outlook files. Outlook remains connected; please try again.",
      });
      return;
    }

    // Microsoft has no per-app refresh-token revocation endpoint; removing the
    // stored tokens ends Receebo's access. Users can also remove the app at
    // https://account.live.com/consent/Manage or https://myapps.microsoft.com.
    await deleteOutlookConnection(req.userId!);
    await db
      .delete(pendingImportsTable)
      .where(
        and(
          eq(pendingImportsTable.userId, req.userId!),
          eq(pendingImportsTable.provider, "outlook"),
          ne(pendingImportsTable.status, "approved"),
        ),
      );
    res.json({ disconnected: true });
  } catch (err) {
    logger.error({ err }, "DELETE /outlook/disconnect failed");
    res.status(500).json({ error: "Failed to disconnect Outlook" });
  }
}));

export default router;
