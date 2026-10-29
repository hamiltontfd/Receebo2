/**
 * Microsoft identity platform + Microsoft Graph client for Outlook import.
 * Pure HTTP (global fetch, injectable for tests); no database access.
 *
 * - OAuth 2.0 authorization-code flow (confidential Web client) against
 *   https://login.microsoftonline.com/{MICROSOFT_TENANT || "common"}.
 * - Delegated scopes: Mail.Read offline_access User.Read openid email.
 * - Refresh tokens rotate: every refresh response may carry a new one, which
 *   callers must persist.
 * - Graph throttling: 429/503/504 honour Retry-After.
 *
 * Errors never include response bodies, tokens or email content; only an
 * HTTP status and (for OAuth) the standard error code.
 */
import { scoreReceiptListing } from "./mailProviders/candidates";
import type { MailMessage } from "./mailProviders/types";

export const OUTLOOK_SCOPES = ["openid", "email", "offline_access", "User.Read", "Mail.Read"];
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_PDF_BYTES = 15 * 1024 * 1024;

export interface OutlookConfig {
  clientId: string;
  clientSecret: string;
  tenant: string;
}

interface OutlookEnvironment {
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT?: string;
}

export function getOutlookConfig(
  environment: OutlookEnvironment = process.env,
): OutlookConfig | null {
  const clientId = environment.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = environment.MICROSOFT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const tenant = environment.MICROSOFT_TENANT?.trim() || "common";
  return { clientId, clientSecret, tenant };
}

function authority(config: OutlookConfig): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0`;
}

export function buildOutlookAuthUrl(
  config: OutlookConfig,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${authority(config)}/authorize?${params.toString()}`;
}

/** OAuth/token failure. `code` is the standard OAuth error (e.g. invalid_grant). */
export class OutlookOAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super("Microsoft token request failed");
    this.name = "OutlookOAuthError";
  }
  /** Mirrors the field read by isReconnectRequiredError(). */
  get oauthError(): string {
    return this.code;
  }
}

/** Graph API failure (status only; the response body is never read). */
export class OutlookGraphError extends Error {
  constructor(readonly status: number) {
    super("Microsoft Graph request failed");
    this.name = "OutlookGraphError";
  }
}

export interface OutlookTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

type FetchLike = typeof fetch;

export interface GraphClientOptions {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function tokenRequest(
  config: OutlookConfig,
  params: Record<string, string>,
  fetchImpl: FetchLike = fetch,
): Promise<OutlookTokens> {
  const res = await fetchImpl(`${authority(config)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: OUTLOOK_SCOPES.join(" "),
      ...params,
    }).toString(),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!res.ok || typeof data.access_token !== "string") {
    const code = typeof data.error === "string" ? data.error : "unknown_error";
    throw new OutlookOAuthError(res.status, code);
  }
  const expiresIn = typeof data.expires_in === "number"
    ? data.expires_in
    : Number(data.expires_in);
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null,
  };
}

export function exchangeOutlookCode(
  config: OutlookConfig,
  code: string,
  redirectUri: string,
  fetchImpl?: FetchLike,
): Promise<OutlookTokens> {
  return tokenRequest(
    config,
    { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    fetchImpl,
  );
}

export function refreshOutlookToken(
  config: OutlookConfig,
  refreshToken: string,
  fetchImpl?: FetchLike,
): Promise<OutlookTokens> {
  return tokenRequest(
    config,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    fetchImpl,
  );
}

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  const base = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 2 ** attempt * 1000;
  return Math.min(base, 60_000);
}

/** GET a Graph URL (absolute or relative to /v1.0) with throttling retries. */
export async function graphGet<T>(
  accessToken: string,
  pathOrUrl: string,
  options: GraphClientOptions & { headers?: Record<string, string> } = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 3;
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  if (!url.startsWith(`${GRAPH_BASE}/`)) {
    // Only ever send the bearer token to Microsoft Graph.
    throw new OutlookGraphError(400);
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
    });
    if (res.ok) return (await res.json()) as T;

    // Response bodies can contain private mailbox data. Keep only the status.
    await res.body?.cancel().catch(() => {});
    const retryable = res.status === 429 || res.status === 503 || res.status === 504;
    if (retryable && attempt < maxRetries) {
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    throw new OutlookGraphError(res.status);
  }
}

export async function getOutlookProfileEmail(
  accessToken: string,
  options: GraphClientOptions = {},
): Promise<string | null> {
  const me = await graphGet<{ mail?: string | null; userPrincipalName?: string | null }>(
    accessToken,
    "/me?$select=mail,userPrincipalName",
    options,
  );
  return me.mail || me.userPrincipalName || null;
}

interface GraphEmailAddress {
  emailAddress?: { name?: string; address?: string };
}

interface GraphMessageListing {
  id: string;
  subject?: string | null;
  from?: GraphEmailAddress | null;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  parentFolderId?: string;
}

export function formatGraphSender(from: GraphEmailAddress | null | undefined): string | null {
  const name = from?.emailAddress?.name?.trim();
  const address = from?.emailAddress?.address?.trim();
  if (name && address) return `${name} <${address}>`;
  return address || name || null;
}

export interface ListCandidatesOptions extends GraphClientOptions {
  now?: number;
  /** Window start; wins over `days`. */
  since?: Date;
  /** Window length when `since` is not given (default 90). */
  days?: number;
  /** Recurring supplier decisions: "off" senders are never listed, "on" senders skip the everyday filter. */
  senderDecision?: (from: string | null) => "on" | "off" | null;
  /** Max messages scanned (listing pages) per run. */
  maxScanned?: number;
  /** Max candidate IDs returned per run. */
  maxCandidates?: number;
  /** Called when the Junk Email folder id cannot be resolved (listing goes on without the junk filter). */
  onJunkLookupFailed?: (err: unknown) => void;
}

/**
 * Id of the mailbox's Junk Email folder (well-known name `junkemail`), or
 * null when it cannot be resolved. Never throws.
 */
export async function getOutlookJunkFolderId(
  accessToken: string,
  options: GraphClientOptions & { onError?: (err: unknown) => void } = {},
): Promise<string | null> {
  try {
    const folder = await graphGet<{ id?: string }>(
      accessToken,
      "/me/mailFolders/junkemail?$select=id",
      options,
    );
    return typeof folder?.id === "string" && folder.id ? folder.id : null;
  } catch (err) {
    options.onError?.(err);
    return null;
  }
}

/**
 * List likely receipt emails received since `since` (or in the last `days`
 * days) across all folders except Junk Email (spam is never imported;
 * Deleted Items and every other folder are kept).
 * Uses a receivedDateTime $filter (deterministic, sortable) and filters
 * subject/sender in code; follows @odata.nextLink.
 */
export async function listOutlookCandidateIds(
  accessToken: string,
  options: ListCandidatesOptions = {},
): Promise<string[]> {
  const now = options.now ?? Date.now();
  const days = options.days ?? 90;
  const maxScanned = options.maxScanned ?? 2000;
  const maxCandidates = options.maxCandidates ?? 200;
  const since = (options.since ?? new Date(now - days * 24 * 60 * 60 * 1000)).toISOString();

  // Resolved once per run; messages in Junk Email are dropped client side
  // (keeps the receivedDateTime $filter/$orderby pair valid for Graph).
  const junkFolderId = await getOutlookJunkFolderId(accessToken, {
    ...options,
    onError: options.onJunkLookupFailed,
  });

  let url: string | undefined =
    `/me/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}` +
    `&$orderby=${encodeURIComponent("receivedDateTime desc")}` +
    `&$select=id,subject,from,receivedDateTime,hasAttachments,parentFolderId&$top=50`;

  const candidates: Array<{ id: string; score: number; order: number }> = [];
  let scanned = 0;
  while (url && scanned < maxScanned && candidates.length < maxCandidates) {
    const page: { value?: GraphMessageListing[]; "@odata.nextLink"?: string } =
      await graphGet(accessToken, url, options);
    for (const message of page.value ?? []) {
      scanned++;
      if (junkFolderId && message.parentFolderId === junkFolderId) continue;
      const from = formatGraphSender(message.from);
      const decision = options.senderDecision?.(from) ?? null;
      if (decision === "off") continue;
      const listing = scoreReceiptListing({
        subject: message.subject ?? null,
        from,
        hasAttachments: message.hasAttachments,
      }, { allowEveryday: decision === "on" });
      if (listing.include) {
        candidates.push({ id: message.id, score: listing.score, order: candidates.length });
        if (candidates.length >= maxCandidates) break;
      }
    }
    url = page["@odata.nextLink"];
  }
  // Highest score first (clear purchases from durable/ticket stores), then
  // newest first, so a capped AI budget is spent on the best candidates.
  return candidates
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((c) => c.id);
}

interface GraphMessage extends GraphMessageListing {
  body?: { contentType?: string; content?: string };
}

interface GraphAttachment {
  "@odata.type"?: string;
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

export function isPdfFileAttachment(att: GraphAttachment): boolean {
  if (att["@odata.type"] !== "#microsoft.graph.fileAttachment") return false;
  if (att.isInline) return false;
  if (typeof att.size === "number" && att.size > MAX_PDF_BYTES) return false;
  const type = (att.contentType ?? "").toLowerCase();
  return type === "application/pdf" || /\.pdf$/i.test(att.name ?? "");
}

export async function getOutlookMessage(
  accessToken: string,
  messageId: string,
  options: GraphClientOptions = {},
): Promise<MailMessage | null> {
  const id = encodeURIComponent(messageId);
  const message = await graphGet<GraphMessage>(
    accessToken,
    `/me/messages/${id}?$select=id,subject,from,receivedDateTime,hasAttachments,body`,
    { ...options, headers: { Prefer: 'outlook.body-content-type="html"' } },
  );
  if (!message?.id) return null;

  let pdfAttachments: MailMessage["pdfAttachments"] = [];
  if (message.hasAttachments) {
    const attachments = await graphGet<{ value?: GraphAttachment[] }>(
      accessToken,
      `/me/messages/${id}/attachments?$select=id,name,contentType,size,isInline`,
      options,
    );
    pdfAttachments = (attachments.value ?? [])
      .filter(isPdfFileAttachment)
      .map((att) => ({ id: att.id, filename: att.name || "receipt.pdf" }));
  }

  const isHtml = (message.body?.contentType ?? "").toLowerCase() === "html";
  const content = message.body?.content ?? null;
  return {
    id: message.id,
    subject: message.subject ?? null,
    from: formatGraphSender(message.from),
    receivedAt: message.receivedDateTime ?? null,
    pdfAttachments,
    html: isHtml ? content : null,
    text: isHtml ? null : content,
  };
}

export async function downloadOutlookAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
  options: GraphClientOptions = {},
): Promise<Buffer> {
  const att = await graphGet<{ contentBytes?: string }>(
    accessToken,
    `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    options,
  );
  if (typeof att.contentBytes !== "string") throw new OutlookGraphError(502);
  return Buffer.from(att.contentBytes, "base64");
}
