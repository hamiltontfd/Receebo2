/**
 * Outlook (Microsoft Graph) mailbox connection + import, plugged into the
 * shared pipeline in mailSync.ts. Inert when MICROSOFT_CLIENT_ID /
 * MICROSOFT_CLIENT_SECRET are missing: the cron sweep does nothing and the
 * routes report "not configured". Background sync runs every 4 h from the
 * cron endpoints (routes/cron.ts); there is no in-process timer.
 */
import { db, emailConnectionsTable, type EmailConnection } from "@workspace/db";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
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
import { connectLockClient, unlockAndRelease } from "./userDataLock";
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

  listCandidateMessageIds: (accessToken, since) => listOutlookCandidateIds(accessToken, { since }),
  getMessage: (accessToken, messageId) => getOutlookMessage(accessToken, messageId),
  downloadAttachment: (accessToken, messageId, attachmentId) =>
    downloadOutlookAttachment(accessToken, messageId, attachmentId),

  async getLastSyncedAt(userId) {
    const [row] = await db
      .select({ lastSyncedAt: emailConnectionsTable.lastSyncedAt })
      .from(emailConnectionsTable)
      .where(
        and(
          eq(emailConnectionsTable.userId, userId),
          eq(emailConnectionsTable.provider, PROVIDER),
        ),
      )
      .limit(1);
    return row?.lastSyncedAt ?? null;
  },

  async markSynced(userId, syncedAt) {
    await db
      .update(emailConnectionsTable)
      .set({ lastSyncedAt: syncedAt, updatedAt: new Date() })
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

/**
 * A connection synced (cron, manual Sync or connect) more recently than this
 * is skipped by the sweep. The sweep runs every 4 h (POST
 * /api/internal/cron/mail-sync); 3 h leaves room for a sync that ran a few
 * minutes after its cron slot, so no mailbox skips a 4 h round.
 */
export const OUTLOOK_SWEEP_FRESH_MS = 3 * 60 * 60 * 1000;
/** Default time budget of one cron call; users not reached are reported as "remaining". */
export const OUTLOOK_SWEEP_TIME_BUDGET_MS = 120_000;
/**
 * Advisory lock key so two cron calls (or instances) never sweep at the same
 * time. Shared by both cron endpoints; the name predates the 4 h schedule.
 */
const SWEEP_LOCK_KEY = "receebo:outlook-daily-sweep";

export interface OutlookSweepResult {
  status: "ok" | "busy" | "inactive";
  /** Connections due (not synced in the last 3 h) at the start of this call. */
  due: number;
  synced: number;
  failed: number;
  queued: number;
  /** Due connections left for the next call because the time budget ran out. */
  remaining: number;
}

/**
 * Outlook sweep (every 4 h via /internal/cron/mail-sync, also run by the daily
 * maintenance call), synchronously inside the cron request (autoscale may stop
 * an instance once no request is in flight, so no background work).
 *
 * - Only connections not synced in the last 3 h are processed, oldest first,
 *   so a repeated call is a no-op (idempotent) and a call that ran out of time
 *   continues where it stopped.
 *   A sync that left messages for later (trial limit, per-run caps, transient
 *   failures) does not move lastSyncedAt, so that user stays due.
 * - Users without current access are skipped inside syncUserMailbox (no AI).
 * - A new user is started only while the time budget lasts; one user's sync
 *   can still take ~2 min (it is capped at 25 email bodies per run).
 */
export async function runOutlookSweep(options: {
  now?: () => number;
  timeBudgetMs?: number;
  syncUser?: (userId: string) => Promise<MailSyncResult>;
} = {}): Promise<OutlookSweepResult> {
  const empty = { due: 0, synced: 0, failed: 0, queued: 0, remaining: 0 };
  if (!isMailProviderEnabled(PROVIDER) || !isOutlookConfigured()) return { status: "inactive", ...empty };
  const now = options.now ?? Date.now;
  const budget = options.timeBudgetMs ?? OUTLOOK_SWEEP_TIME_BUDGET_MS;
  const syncUser = options.syncUser ?? syncUserOutlook;
  const started = now();

  const lease = await connectLockClient();
  const lockClient = lease.client;
  let locked = false;
  try {
    const lock = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [SWEEP_LOCK_KEY]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) {
      logger.warn("Outlook sync: sweep already running, skipping");
      return { status: "busy", ...empty };
    }

    const freshAfter = new Date(started - OUTLOOK_SWEEP_FRESH_MS);
    const due = await db
      .select({ userId: emailConnectionsTable.userId })
      .from(emailConnectionsTable)
      .where(and(
        eq(emailConnectionsTable.provider, PROVIDER),
        ne(emailConnectionsTable.status, "needs_reconnect"),
        or(isNull(emailConnectionsTable.lastSyncedAt), lt(emailConnectionsTable.lastSyncedAt, freshAfter)),
      ))
      .orderBy(sql`${emailConnectionsTable.lastSyncedAt} ASC NULLS FIRST`);

    const result: OutlookSweepResult = { status: "ok", ...empty, due: due.length };
    logger.info({ due: due.length }, "Outlook sync: starting sweep");
    for (const [index, conn] of due.entries()) {
      if (now() - started >= budget) {
        result.remaining = due.length - index;
        break;
      }
      try {
        const synced = await syncUser(conn.userId);
        result.synced++;
        result.queued += synced.queued;
        if (synced.queued > 0) {
          logger.info({ userId: conn.userId, ...synced }, "Outlook sync: new pending imports created");
        }
      } catch (err) {
        result.failed++;
        logger.error({ err, userId: conn.userId }, "Outlook sync: user sweep error");
      }
    }
    logger.info({ ...result, elapsedMs: now() - started }, "Outlook sync: sweep finished");
    return result;
  } finally {
    await unlockAndRelease(lease, SWEEP_LOCK_KEY, locked);
  }
}
