import type pino from "pino";
import type { MailProviderId } from "./config";

export type { MailProviderId } from "./config";

export type MailConnectionStatus = "active" | "needs_reconnect";

export interface MailAttachmentRef {
  id: string;
  filename: string;
}

/** Provider-neutral view of one email, enough to decide how to import it. */
export interface MailMessage {
  id: string;
  subject: string | null;
  from: string | null;
  receivedAt: string | null;
  pdfAttachments: MailAttachmentRef[];
  html: string | null;
  text: string | null;
}

/**
 * One mailbox provider plugged into the shared import pipeline (mailSync.ts).
 * Connection/OAuth routes stay provider-specific; the pipeline only needs
 * these operations.
 */
export interface MailProvider {
  id: MailProviderId;
  /** Human label used in logs and UI, e.g. "Gmail", "Outlook". */
  label: string;
  logger: pino.Logger;
  isConfigured(): boolean;
  /**
   * Returns a fresh access token, or null when the user has no connection.
   * Throws MailReconnectRequiredError when the provider rejected the refresh
   * token (the connection is marked needs_reconnect before throwing).
   */
  getAccessToken(userId: string): Promise<string | null>;
  /**
   * Message IDs of likely receipts received on or after `since` (see
   * mailSync.ts syncWindowStart: last complete sync minus an overlap, at most
   * 90 days back).
   */
  listCandidateMessageIds(accessToken: string, since: Date): Promise<string[]>;
  getMessage(accessToken: string, messageId: string): Promise<MailMessage | null>;
  downloadAttachment(
    accessToken: string,
    messageId: string,
    attachmentId: string,
  ): Promise<Buffer>;
  /**
   * When the last complete sync started (null before the first one). It
   * anchors the next sync's search window.
   */
  getLastSyncedAt(userId: string): Promise<Date | null>;
  /**
   * Record a complete sync. `syncedAt` is when that run started listing, so
   * mail that arrived while it ran is still inside the next window.
   */
  markSynced(userId: string, syncedAt: Date): Promise<void>;
}

/** Thrown when the user must reconnect the mailbox (invalid_grant etc.). */
export class MailReconnectRequiredError extends Error {
  readonly code = "needs_reconnect";
  constructor(
    readonly provider: MailProviderId,
    options?: { cause?: unknown },
  ) {
    super(`${provider} authorization needs to be refreshed`, options);
    this.name = "MailReconnectRequiredError";
  }
}

/** OAuth error codes that mean the stored refresh token is no longer usable. */
const RECONNECT_ERROR_CODES = new Set([
  "invalid_grant",
  "interaction_required",
  "consent_required",
  "login_required",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * True when an OAuth/token error means the user must reconnect. Handles
 * google-auth-library (err.response.data.error) and our Microsoft errors
 * (err.code / err.oauthError).
 */
export function isReconnectRequiredError(error: unknown): boolean {
  if (error instanceof MailReconnectRequiredError) return true;
  const err = asRecord(error);
  const data = asRecord(asRecord(err.response).data);
  const candidates = [data.error, err.oauthError, err.code];
  return candidates.some(
    (value) => typeof value === "string" && RECONNECT_ERROR_CODES.has(value),
  );
}
