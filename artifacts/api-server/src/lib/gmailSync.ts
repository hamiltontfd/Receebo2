import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  gmailConnectionsTable,
  gmailSeenMessagesTable,
  pendingImportsTable,
  type GmailConnection,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { objectStorageClient } from "./objectStorage";
import { extractReceiptData } from "./receiptExtraction";
import { logger } from "./logger";
import { encryptToken, decryptToken } from "./tokenCrypto";

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

function getOAuth2Client(redirectUri?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ---------------------------------------------------------------------------
// Token encryption helpers
// ---------------------------------------------------------------------------

/**
 * Returns a copy of `connection` with tokens decrypted to plaintext.
 * All rows are expected to be encrypted by the startup migration in index.ts;
 * the lazy re-encryption path has been removed now that the migration runs on
 * every deploy.
 */
function decryptGmailConnection(
  connection: GmailConnection,
): GmailConnection {
  let accessTokenPlain: string | null = null;

  if (connection.accessToken !== null) {
    const { plaintext } = decryptToken(connection.accessToken);
    accessTokenPlain = plaintext;
  }

  const { plaintext: refreshTokenPlain } = decryptToken(connection.refreshToken);

  return {
    ...connection,
    accessToken: accessTokenPlain,
    refreshToken: refreshTokenPlain,
  };
}

/**
 * Build the Google OAuth consent URL for the gmail.readonly scope.
 * `prompt: 'consent'` forces Google to always return a refresh_token.
 */
export function buildGmailOAuthUrl(
  redirectUri: string,
  state: string,
): string {
  const client = getOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
    prompt: "consent",
  });
}

/**
 * Exchange an authorization code for tokens and persist them to the DB.
 * Returns the user's Gmail address (for display in Settings).
 */
export async function exchangeCodeAndStore(
  userId: string,
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const client = getOAuth2Client(redirectUri);
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token — the user may need to " +
        "revoke app access in their Google account and reconnect.",
    );
  }

  // Fetch the Gmail address to show in Settings
  let gmailEmail: string | null = null;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (res.ok) {
      const info = (await res.json()) as { email?: string };
      gmailEmail = info.email ?? null;
    }
  } catch (err) {
    logger.warn({ err }, "Gmail: failed to fetch userinfo");
  }

  const encryptedAccessToken = tokens.access_token
    ? encryptToken(tokens.access_token)
    : null;
  const encryptedRefreshToken = encryptToken(tokens.refresh_token);

  await db
    .insert(gmailConnectionsTable)
    .values({
      userId,
      gmailEmail,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    })
    .onConflictDoUpdate({
      target: gmailConnectionsTable.userId,
      set: {
        gmailEmail,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        updatedAt: new Date(),
      },
    });

  return gmailEmail;
}

/**
 * Refresh the access token using the stored refresh token and persist the new values.
 * `connection` must already have plaintext tokens (call decryptGmailConnection first).
 */
async function getFreshAccessToken(
  connection: GmailConnection,
): Promise<string> {
  const client = getOAuth2Client();
  client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry?.getTime(),
  });

  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Token refresh returned no access token");
  }

  await db
    .update(gmailConnectionsTable)
    .set({
      accessToken: encryptToken(credentials.access_token),
      tokenExpiry: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(gmailConnectionsTable.userId, connection.userId));

  return credentials.access_token;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Upload a PDF buffer directly to GCS using the same path conventions as
 * user-uploaded receipts.  Returns the `/objects/uploads/{uuid}` path that
 * gets stored in the DB.
 */
async function uploadPdfToStorage(buffer: Buffer): Promise<string> {
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

// ---------------------------------------------------------------------------
// Gmail REST helpers
// ---------------------------------------------------------------------------

async function gmailGet(accessToken: string, path: string): Promise<unknown> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailMessagePart[];
}

/** Recursively walk a MIME tree and collect all application/pdf parts. */
function collectPdfParts(part: GmailMessagePart): GmailMessagePart[] {
  const results: GmailMessagePart[] = [];
  if (
    part.mimeType === "application/pdf" &&
    part.body?.attachmentId
  ) {
    results.push(part);
  }
  if (part.parts) {
    for (const child of part.parts) {
      results.push(...collectPdfParts(child));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------

/**
 * Sync one user's Gmail account:
 * 1. Search for emails with PDF attachments that look like receipts (last 90 days).
 * 2. Skip any message ID already in gmail_seen_messages.
 * 3. Download each PDF, upload to object storage, run through AI extraction.
 * 4. If isReceipt → insert a pending_imports row.
 *
 * Message IDs are written to gmail_seen_messages *before* extraction starts so
 * that a crash mid-extraction never re-queues the same file.
 */
export async function syncUserGmail(
  userId: string,
): Promise<{ checked: number; queued: number }> {
  const [connection] = await db
    .select()
    .from(gmailConnectionsTable)
    .where(eq(gmailConnectionsTable.userId, userId))
    .limit(1);

  if (!connection) return { checked: 0, queued: 0 };

  // Decrypt stored tokens before use
  let decryptedConnection: GmailConnection;
  try {
    decryptedConnection = decryptGmailConnection(connection);
  } catch (err) {
    logger.error({ err, userId }, "Gmail sync: token decryption failed");
    return { checked: 0, queued: 0 };
  }

  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken(decryptedConnection);
  } catch (err) {
    logger.error({ err, userId }, "Gmail sync: token refresh failed");
    return { checked: 0, queued: 0 };
  }

  // Gmail search query — PDF attachments + receipt-like subjects, last 90 days
  const afterEpoch = Math.floor(
    (Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000,
  );
  const q = encodeURIComponent(
    `has:attachment filename:pdf ` +
      `(subject:receipt OR subject:order OR subject:invoice OR subject:confirmation) ` +
      `after:${afterEpoch}`,
  );

  let messageIds: string[] = [];
  try {
    const data = (await gmailGet(
      accessToken,
      `messages?q=${q}&maxResults=100`,
    )) as { messages?: Array<{ id: string }> };
    messageIds = (data.messages ?? []).map((m) => m.id);
  } catch (err) {
    logger.error({ err, userId }, "Gmail sync: failed to list messages");
    return { checked: 0, queued: 0 };
  }

  let checked = 0;
  let queued = 0;

  for (const messageId of messageIds) {
    // Record the message as seen BEFORE processing (crash-safe dedup)
    try {
      await db
        .insert(gmailSeenMessagesTable)
        .values({ userId, gmailMessageId: messageId });
    } catch {
      // Unique constraint → already processed
      continue;
    }

    checked++;

    // Fetch full message to inspect MIME parts
    let payload: GmailMessagePart | undefined;
    try {
      const msg = (await gmailGet(
        accessToken,
        `messages/${messageId}?format=full`,
      )) as { payload?: GmailMessagePart };
      payload = msg.payload;
    } catch (err) {
      logger.warn({ err, messageId, userId }, "Gmail sync: failed to fetch message");
      continue;
    }

    if (!payload) continue;
    const pdfParts = collectPdfParts(payload);
    if (pdfParts.length === 0) continue;

    for (const part of pdfParts) {
      const attachmentId = part.body!.attachmentId!;
      const filename = part.filename || "receipt.pdf";

      // Download the attachment
      let pdfBuffer: Buffer;
      try {
        const att = (await gmailGet(
          accessToken,
          `messages/${messageId}/attachments/${attachmentId}`,
        )) as { data: string };
        // Gmail returns base64url-encoded data
        pdfBuffer = Buffer.from(att.data, "base64url");
      } catch (err) {
        logger.warn(
          { err, messageId, attachmentId },
          "Gmail sync: attachment download failed",
        );
        continue;
      }

      // Upload to object storage
      let objectPath: string;
      try {
        objectPath = await uploadPdfToStorage(pdfBuffer);
      } catch (err) {
        logger.error({ err, userId }, "Gmail sync: storage upload failed");
        continue;
      }

      // AI extraction
      let extraction: Awaited<ReturnType<typeof extractReceiptData>>;
      try {
        extraction = await extractReceiptData(objectPath, "application/pdf");
      } catch (err) {
        logger.warn({ err, objectPath }, "Gmail sync: extraction failed");
        continue;
      }

      if (!extraction.isReceipt) {
        logger.info({ objectPath }, "Gmail sync: PDF is not a receipt, skipping");
        continue;
      }

      // Store as pending import
      try {
        await db.insert(pendingImportsTable).values({
          userId,
          gmailMessageId: messageId,
          objectPath,
          originalFileName: filename,
          extractionData: {
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
          },
        });
        queued++;
        logger.info(
          { userId, messageId, filename, merchant: extraction.merchant },
          "Gmail sync: receipt queued as pending import",
        );
      } catch (err) {
        logger.error({ err, userId }, "Gmail sync: failed to store pending import");
      }
    }
  }

  // Update last-synced timestamp
  await db
    .update(gmailConnectionsTable)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(gmailConnectionsTable.userId, userId));

  logger.info({ userId, checked, queued }, "Gmail sync complete");
  return { checked, queued };
}

/** Sweep all connected Gmail accounts. Called by the scheduler. */
export async function syncAllGmailConnections(): Promise<void> {
  let connections: GmailConnection[];
  try {
    connections = await db.select().from(gmailConnectionsTable);
  } catch (err) {
    logger.error({ err }, "Gmail sync: failed to load connections");
    return;
  }

  if (connections.length === 0) return;
  logger.info({ count: connections.length }, "Gmail sync: starting sweep");

  for (const conn of connections) {
    try {
      const result = await syncUserGmail(conn.userId);
      if (result.queued > 0) {
        logger.info(
          { userId: conn.userId, ...result },
          "Gmail sync: new pending imports created",
        );
      }
    } catch (err) {
      logger.error({ err, userId: conn.userId }, "Gmail sync: user sweep error");
    }
  }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

const GMAIL_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours
let gmailSyncTimer: ReturnType<typeof setInterval> | null = null;

export function startGmailSyncScheduler(): void {
  if (gmailSyncTimer) return;

  // Delay initial sync by 90 s to let the server fully start up
  const initial = setTimeout(
    () => void syncAllGmailConnections(),
    90_000,
  );
  if (initial.unref) initial.unref();

  gmailSyncTimer = setInterval(
    () => void syncAllGmailConnections(),
    GMAIL_SYNC_INTERVAL_MS,
  );
  if (gmailSyncTimer.unref) gmailSyncTimer.unref();

  logger.info(
    { intervalMs: GMAIL_SYNC_INTERVAL_MS },
    "Gmail sync scheduler started",
  );
}

export function stopGmailSyncScheduler(): void {
  if (gmailSyncTimer) {
    clearInterval(gmailSyncTimer);
    gmailSyncTimer = null;
  }
}
