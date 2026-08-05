import { Router, type Request } from "express";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
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
// OAuth state security
//
// Each /gmail/connect request generates a random nonce that is:
//   1. Stored server-side with a 10-minute TTL (pendingOAuthNonces map)
//   2. Included in a HMAC-SHA256-signed state token sent to Google
//
// The callback verifies the HMAC, then consumes the nonce (one-time use).
// This prevents CSRF and state-tampering / account-linking attacks.
// ---------------------------------------------------------------------------

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface NonceEntry {
  userId: string;
  expiresAt: number;
}
// nonce → {userId, expiresAt}
const pendingOAuthNonces = new Map<string, NonceEntry>();

// Prune expired nonces every 5 minutes to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of pendingOAuthNonces) {
    if (entry.expiresAt <= now) pendingOAuthNonces.delete(nonce);
  }
}, 5 * 60 * 1000).unref();

function getStateSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return Buffer.from(secret, "utf8");
}

/** Build a signed state token: base64url(payload) + "." + HMAC hex */
function buildSignedState(userId: string, nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, nonce })).toString("base64url");
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Verify a signed state token, consume the nonce, and return userId.
 * Throws if the signature is invalid, the nonce is unknown/expired,
 * or the parsed userId does not match the stored entry.
 */
function verifyAndConsumeState(state: string): string {
  const dotIdx = state.lastIndexOf(".");
  if (dotIdx < 0) throw new Error("Malformed state: no separator");

  const payload = state.slice(0, dotIdx);
  const receivedSig = state.slice(dotIdx + 1);

  // Constant-time signature check
  const expectedSig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  const receivedBuf = Buffer.from(receivedSig, "hex");
  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw new Error("Invalid state signature");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    userId?: string;
    nonce?: string;
  };
  if (!parsed.userId || !parsed.nonce) throw new Error("Incomplete state payload");

  const entry = pendingOAuthNonces.get(parsed.nonce);
  if (!entry) throw new Error("Unknown or already-used nonce");
  if (entry.expiresAt <= Date.now()) {
    pendingOAuthNonces.delete(parsed.nonce);
    throw new Error("Expired nonce");
  }
  if (entry.userId !== parsed.userId) throw new Error("userId mismatch in state");

  // Consume nonce — one-time use
  pendingOAuthNonces.delete(parsed.nonce);

  return parsed.userId;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redirectUri(req: Request): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}/api/gmail/callback`;
  return `${req.protocol}://${req.get("host")}/api/gmail/callback`;
}

function appSettingsUrl(req: Request, params: string): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/settings${params}`;
  }
  return `${req.protocol}://${req.get("host")}/settings${params}`;
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
    const nonce = randomBytes(32).toString("hex");
    // Store nonce server-side — validated and consumed in the callback
    pendingOAuthNonces.set(nonce, {
      userId: req.userId!,
      expiresAt: Date.now() + NONCE_TTL_MS,
    });

    const state = buildSignedState(req.userId!, nonce);
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
    userId = verifyAndConsumeState(state);
  } catch (err) {
    logger.warn({ err }, "Gmail callback: invalid or tampered state");
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
