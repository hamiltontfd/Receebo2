export type MailProviderId = "gmail" | "outlook";

export const MAIL_PROVIDER_LABELS: Record<MailProviderId, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
};

// The connect URL must point at the provider's own sign-in page.
const ALLOWED_AUTH_ORIGINS: Record<MailProviderId, string[]> = {
  gmail: ["https://accounts.google.com"],
  outlook: ["https://login.microsoftonline.com"],
};

export interface MailProviderStatus {
  id: MailProviderId;
  label: string;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  lastSyncedAt: string | null;
  needsReconnect: boolean;
}

export interface MailStatus {
  enabledProviders: MailProviderId[];
  providers: MailProviderStatus[];
  needsReconnect: boolean;
  pendingCount: number;
}

export interface MailSyncResult {
  checked: number;
  queued: number;
  needsReconnect?: MailProviderId[];
  failed?: MailProviderId[];
}

/**
 * Fetch the provider sign-in URL as JSON (works with older installed service
 * workers that intercept top-level API navigations) and validate it.
 */
export async function getMailConnectionUrl(
  base: string,
  provider: MailProviderId,
): Promise<string> {
  const label = MAIL_PROVIDER_LABELS[provider];
  const res = await fetch(`${base}api/${provider}/connect-url`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Could not start the ${label} connection. Please try again.`);
  }
  const data: { url?: unknown } = await res.json();
  if (typeof data.url !== "string") {
    throw new Error(`The ${label} connection returned an invalid address.`);
  }
  const url = new URL(data.url);
  if (!ALLOWED_AUTH_ORIGINS[provider].includes(url.origin)) {
    throw new Error(`The ${label} connection returned an unexpected address.`);
  }
  return url.href;
}

/** Normalise /api/mail/status, tolerating older or partial responses. */
export function normalizeMailStatus(data: unknown): MailStatus {
  const raw = (data ?? {}) as Partial<MailStatus>;
  const providers = Array.isArray(raw.providers)
    ? raw.providers.filter(
        (p): p is MailProviderStatus =>
          !!p && (p.id === "gmail" || p.id === "outlook"),
      )
    : [];
  return {
    enabledProviders: Array.isArray(raw.enabledProviders) ? raw.enabledProviders : [],
    providers,
    needsReconnect: providers.some((p) => p.enabled && p.needsReconnect),
    pendingCount: typeof raw.pendingCount === "number" ? raw.pendingCount : 0,
  };
}

export async function fetchMailStatus(base: string): Promise<MailStatus> {
  const res = await fetch(`${base}api/mail/status`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load email connections");
  return normalizeMailStatus(await res.json());
}

export async function disconnectMailProvider(
  base: string,
  provider: MailProviderId,
): Promise<void> {
  const res = await fetch(`${base}api/${provider}/disconnect`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to disconnect");
}

export async function syncMail(base: string): Promise<MailSyncResult> {
  const res = await fetch(`${base}api/mail/sync`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json() as Promise<MailSyncResult>;
}

/** Reads ?gmail=… / ?outlook=… after the OAuth redirect back to Settings. */
export function readMailOAuthResult(
  search: string,
): { provider: MailProviderId; result: "connected" | "error" } | null {
  const params = new URLSearchParams(search);
  for (const provider of ["outlook", "gmail"] as const) {
    const value = params.get(provider);
    if (value === "connected" || value === "error") return { provider, result: value };
  }
  return null;
}
