/**
 * Outlook (Microsoft Graph) mailbox connection + import, plugged into the
 * shared pipeline in mailSync.ts. Inert when MICROSOFT_CLIENT_ID /
 * MICROSOFT_CLIENT_SECRET are missing: nothing is scheduled and the routes
 * report "not configured".
 */
import { db, emailConnectionsTable, type EmailConnection } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { outlookLogger as logger } from "./logger";
import { decryptToken, encryptToken, hasTokenEncryptionKey } from "./tokenCrypto";
import {
  downloadOutlookAttachment,
  exchangeOutlookCode,
  getOutlookConfig,
  getOutlookMessage,
  getOutlookProfileEmail,
  listOutlookCandidateIds,
  refreshOutlookToken,
  type OutlookConfig,
} from "./outlookGraph";
import { syncUserMailbox, type MailSyncResult } from "./mailSync";
import { isMailProviderEnabled } from "./mailProviders/config";
import {
  MailReconnectRequiredError,
  isReconnectRequiredError,
  type MailProvider,
} from "./mailProviders/types";

const PROVIDER = "outlook" as const;
/** Reuse a stored access token only if it is valid for at least this long. */
const ACCESS_TOKEN_MIN_REMAINING_MS = 2 * 60 * 1000;

export function isOutlookConfigured(): boolean {
  return getOutlookConfig() !== null && hasTokenEncryptionKey();
}

function requireConfig(): OutlookConfig {
  const config = getOutlookConfig();
  if (!config) {
    throw new Error("MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set");
  }
  return config;
}

export async function getOutlookConnection(userId: string): Promise<EmailConnection | null> {
  const [connection] = await db
    .select()
    .from(emailConnectionsTable)
    .where(
      and(
        eq(emailConnectionsTable.userId, userId),
        eq(emailConnectionsTable.provider, PROVIDER),
      ),
    )
    .limit(1);
  return connection ?? null;
}

/**
 * Exchange an authorization code, read the mailbox address and persist the
 * encrypted tokens. Reconnecting overwrites the old tokens and clears
 * needs_reconnect. Returns the account email for display.
 */
export async function exchangeOutlookCodeAndStore(
  userId: string,
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const config = requireConfig();
  const tokens = await exchangeOutlookCode(config, code, redirectUri);
  if (!tokens.refreshToken) {
    throw new Error("Microsoft did not return a refresh token (offline_access missing)");
  }

  let accountEmail: string | null = null;
  try {
    accountEmail = await getOutlookProfileEmail(tokens.accessToken);
  } catch (err) {
    logger.warn({ err }, "Outlook: failed to fetch profile");
  }

  const values = {
    accountEmail,
    accessToken: encryptToken(tokens.accessToken),
    refreshToken: encryptToken(tokens.refreshToken),
    tokenExpiry: tokens.expiresAt,
    status: "active",
    lastError: null,
    updatedAt: new Date(),
  };
  await db
    .insert(emailConnectionsTable)
    .values({ userId, provider: PROVIDER, ...values })
    .onConflictDoUpdate({
      target: [emailConnectionsTable.userId, emailConnectionsTable.provider],
      set: values,
    });
  return accountEmail;
}

async function markNeedsReconnect(userId: string, code: string): Promise<void> {
  await db
    .update(emailConnectionsTable)
    .set({ status: "needs_reconnect", lastError: code, updatedAt: new Date() })
    .where(
      and(
        eq(emailConnectionsTable.userId, userId),
        eq(emailConnectionsTable.provider, PROVIDER),
      ),
    );
}

/** Remove local Outlook credentials (Microsoft has no per-app token revoke). */
export async function deleteOutlookConnection(userId: string): Promise<void> {
  await db
    .delete(emailConnectionsTable)
    .where(
      and(
        eq(emailConnectionsTable.userId, userId),
        eq(emailConnectionsTable.provider, PROVIDER),
      ),
    );
}

export const outlookProvider: MailProvider = {
  id: PROVIDER,
  label: "Outlook",
  logger,
  isConfigured: isOutlookConfigured,

  async getAccessToken(userId) {
    const connection = await getOutlookConnection(userId);
    if (!connection) return null;
    const config = requireConfig();

    let refreshToken: string;
    let accessToken: string | null = null;
    try {
      refreshToken = decryptToken(connection.refreshToken).plaintext;
      if (connection.accessToken) accessToken = decryptToken(connection.accessToken).plaintext;
    } catch (err) {
      logger.error({ err, userId }, "Outlook sync: token decryption failed");
      throw new Error("Stored Outlook credentials could not be decrypted", { cause: err });
    }

    const expiry = connection.tokenExpiry?.getTime() ?? 0;
    if (
      accessToken &&
      connection.status === "active" &&
      expiry - Date.now() > ACCESS_TOKEN_MIN_REMAINING_MS
    ) {
      return accessToken;
    }

    try {
      const tokens = await refreshOutlookToken(config, refreshToken);
      await db
        .update(emailConnectionsTable)
        .set({
          accessToken: encryptToken(tokens.accessToken),
          // Microsoft rotates refresh tokens; always keep the newest one.
          ...(tokens.refreshToken ? { refreshToken: encryptToken(tokens.refreshToken) } : {}),
          tokenExpiry: tokens.expiresAt,
          status: "active",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(emailConnectionsTable.id, connection.id));
      return tokens.accessToken;
    } catch (err) {
      logger.error({ err, userId }, "Outlook sync: token refresh failed");
      if (isReconnectRequiredError(err)) {
        await markNeedsReconnect(userId, "invalid_grant").catch((markErr) =>
          logger.warn({ err: markErr, userId }, "Outlook sync: could not mark connection for reconnect"),
        );
        throw new MailReconnectRequiredError(PROVIDER, { cause: err });
      }
      throw new Error("Outlook authorization needs to be refreshed", { cause: err });
    }
  },

  listCandidateMessageIds: (accessToken) => listOutlookCandidateIds(accessToken),
  getMessage: (accessToken, messageId) => getOutlookMessage(accessToken, messageId),
  downloadAttachment: (accessToken, messageId, attachmentId) =>
    downloadOutlookAttachment(accessToken, messageId, attachmentId),

  async markSynced(userId) {
    await db
      .update(emailConnectionsTable)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(emailConnectionsTable.userId, userId),
          eq(emailConnectionsTable.provider, PROVIDER),
        ),
      );
  },
};

export function syncUserOutlook(userId: string): Promise<MailSyncResult> {
  return syncUserMailbox(userId, outlookProvider);
}

let outlookSweepRunning = false;

/** Sweep all active Outlook connections. Called by the scheduler. */
export async function syncAllOutlookConnections(): Promise<void> {
  if (!isMailProviderEnabled(PROVIDER) || !isOutlookConfigured()) return;
  if (outlookSweepRunning) {
    logger.warn("Outlook sync: previous sweep still running, skipping overlap");
    return;
  }
  outlookSweepRunning = true;
  try {
    const connections = await db
      .select({ userId: emailConnectionsTable.userId })
      .from(emailConnectionsTable)
      .where(
        and(
          eq(emailConnectionsTable.provider, PROVIDER),
          ne(emailConnectionsTable.status, "needs_reconnect"),
        ),
      );
    if (connections.length === 0) return;
    logger.info({ count: connections.length }, "Outlook sync: starting sweep");
    for (const conn of connections) {
      try {
        const result = await syncUserOutlook(conn.userId);
        if (result.queued > 0) {
          logger.info({ userId: conn.userId, ...result }, "Outlook sync: new pending imports created");
        }
      } catch (err) {
        logger.error({ err, userId: conn.userId }, "Outlook sync: user sweep error");
      }
    }
  } catch (err) {
    logger.error({ err }, "Outlook sync: failed to load connections");
  } finally {
    outlookSweepRunning = false;
  }
}

const OUTLOOK_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours
let outlookSyncTimer: ReturnType<typeof setInterval> | null = null;

export function startOutlookSyncScheduler(): void {
  if (outlookSyncTimer) return;
  const initial = setTimeout(() => void syncAllOutlookConnections(), 120_000);
  if (initial.unref) initial.unref();
  outlookSyncTimer = setInterval(
    () => void syncAllOutlookConnections(),
    OUTLOOK_SYNC_INTERVAL_MS,
  );
  if (outlookSyncTimer.unref) outlookSyncTimer.unref();
  logger.info({ intervalMs: OUTLOOK_SYNC_INTERVAL_MS }, "Outlook sync scheduler started");
}

export function stopOutlookSyncScheduler(): void {
  if (outlookSyncTimer) {
    clearInterval(outlookSyncTimer);
    outlookSyncTimer = null;
  }
}
