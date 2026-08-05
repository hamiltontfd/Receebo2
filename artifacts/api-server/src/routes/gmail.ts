import { Router, type Request } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  gmailConnectionsTable,
  pendingImportsTable,
  receiptsTable,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  buildGmailOAuthUrl,
  exchangeCodeAndStore,
  syncUserGmail,
  isGmailConfigured,
} from "../lib/gmailSync";
import { logger } from "../lib/logger";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redirectUri(req: Request): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}/api/gmail/callback`;
  return `${req.protocol}://${req.get("host")}/api/gmail/callback`;
}

function appSettingsUrl(req: Request, params: string): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  const base = domain ? `https://${domain}` : `${req.protocol}://${req.get("host")}`;
  // The receiptr artifact is mounted at /receiptr
  return `${base}/receiptr/settings${params}`;
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
      configured: isGmailConfigured(),
      connected: !!conn,
      gmailEmail: conn?.gmailEmail ?? null,
      lastSyncedAt: conn?.lastSyncedAt ?? null,
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
router.get("/gmail/connect", requireAuth, (req, res): void => {
  if (!isGmailConfigured()) {
    res.status(503).json({
      error:
        "Gmail integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
    return;
  }

  try {
    const nonce = randomBytes(16).toString("hex");
    // Encode userId + nonce in state so the callback knows who to store tokens for
    const state = Buffer.from(
      JSON.stringify({ userId: req.userId!, nonce }),
    ).toString("base64url");

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
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code }, "Gmail callback: missing params or OAuth error");
    res.redirect(appSettingsUrl(req, "?gmail=error"));
    return;
  }

  let userId: string;
  try {
    const payload = JSON.parse(Buffer.from(state, "base64url").toString()) as {
      userId?: string;
    };
    if (!payload.userId) throw new Error("Missing userId in state");
    userId = payload.userId;
  } catch (err) {
    logger.warn({ err }, "Gmail callback: invalid state");
    res.redirect(appSettingsUrl(req, "?gmail=error"));
    return;
  }

  try {
    await exchangeCodeAndStore(userId, code, redirectUri(req));
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
router.delete("/gmail/disconnect", requireAuth, async (req, res): Promise<void> => {
  try {
    await db
      .delete(gmailConnectionsTable)
      .where(eq(gmailConnectionsTable.userId, req.userId!));

    // Remove pending (unapproved) imports — approved ones became real receipts
    await db
      .delete(pendingImportsTable)
      .where(
        and(
          eq(pendingImportsTable.userId, req.userId!),
          eq(pendingImportsTable.status, "pending"),
        ),
      );

    res.json({ disconnected: true });
  } catch (err) {
    logger.error({ err }, "DELETE /gmail/disconnect failed");
    res.status(500).json({ error: "Failed to disconnect Gmail" });
  }
});

// ---------------------------------------------------------------------------
// POST /gmail/sync  — manual trigger
// ---------------------------------------------------------------------------
router.post("/gmail/sync", requireAuth, async (req, res): Promise<void> => {
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
router.get("/gmail/pending", requireAuth, async (req, res): Promise<void> => {
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
  "/gmail/pending/:id/approve",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const [imp] = await db
        .select()
        .from(pendingImportsTable)
        .where(
          and(
            eq(pendingImportsTable.id, id),
            eq(pendingImportsTable.userId, req.userId!),
            eq(pendingImportsTable.status, "pending"),
          ),
        )
        .limit(1);

      if (!imp) {
        res.status(404).json({ error: "Pending import not found" });
        return;
      }

      const data = imp.extractionData!;

      const [receipt] = await db
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

      await db
        .update(pendingImportsTable)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(pendingImportsTable.id, id));

      logger.info(
        { userId: req.userId, importId: id, receiptId: receipt.id },
        "Gmail import approved",
      );
      res.json({ approved: true, receiptId: receipt.id });
    } catch (err) {
      logger.error({ err }, "POST /gmail/pending/:id/approve failed");
      res.status(500).json({ error: "Failed to approve import" });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /gmail/pending/:id  — dismiss
// ---------------------------------------------------------------------------
router.delete(
  "/gmail/pending/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      await db
        .update(pendingImportsTable)
        .set({ status: "dismissed", updatedAt: new Date() })
        .where(
          and(
            eq(pendingImportsTable.id, id),
            eq(pendingImportsTable.userId, req.userId!),
          ),
        );

      res.json({ dismissed: true });
    } catch (err) {
      logger.error({ err }, "DELETE /gmail/pending/:id failed");
      res.status(500).json({ error: "Failed to dismiss import" });
    }
  },
);

export default router;
