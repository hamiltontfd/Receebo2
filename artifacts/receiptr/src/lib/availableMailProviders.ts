import { useEffect, useState } from "react";
import type { MailProviderId } from "./mailConnection";

/**
 * Which inbox providers a visitor can connect right now, from the public
 * GET /api/mail/providers endpoint (driven by MAIL_PROVIDERS_ENABLED plus
 * configured OAuth credentials). Marketing copy uses this instead of
 * hard-coding a provider, so re-enabling Gmail later restores it.
 */
export interface AvailableMailProvider {
  id: MailProviderId;
  label: string;
}

const BASE = (import.meta.env.BASE_URL as string).replace(/\/?$/, "/");

let cache: AvailableMailProvider[] | null = null;
let inflight: Promise<AvailableMailProvider[]> | null = null;

export function parseAvailableMailProviders(data: unknown): AvailableMailProvider[] {
  const raw = (data as { providers?: unknown } | null)?.providers;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is AvailableMailProvider =>
      !!p &&
      (p.id === "outlook" || p.id === "gmail") &&
      typeof p.label === "string",
  );
}

export function fetchAvailableMailProviders(): Promise<AvailableMailProvider[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = Promise.resolve()
      .then(() => fetch(`${BASE}api/mail/providers`, { credentials: "omit" }))
      .then((res) => (res.ok ? res.json() : { providers: [] }))
      .then((data) => (cache = parseAvailableMailProviders(data)))
      .catch(() => [] as AvailableMailProvider[])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Test helper. */
export function resetAvailableMailProvidersCache(): void {
  cache = null;
  inflight = null;
}

export function useAvailableMailProviders(): AvailableMailProvider[] {
  const [providers, setProviders] = useState<AvailableMailProvider[]>(cache ?? []);
  useEffect(() => {
    let active = true;
    void fetchAvailableMailProviders().then((list) => {
      if (active) setProviders(list);
    });
    return () => {
      active = false;
    };
  }, []);
  return providers;
}

/** "Outlook", "Gmail or Outlook", or null when nothing is connectable. */
export function providerNames(providers: AvailableMailProvider[]): string | null {
  const labels = providers.map((p) => p.label);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/** "your Outlook inbox" / "your inbox". */
export function inboxPhrase(providers: AvailableMailProvider[]): string {
  const names = providerNames(providers);
  return names ? `your ${names} inbox` : "your inbox";
}

/** Reassurance line for the Microsoft account family, when Outlook is offered. */
export function outlookAccountsNote(providers: AvailableMailProvider[]): string | null {
  return providers.some((p) => p.id === "outlook")
    ? "Works with Outlook.com, Hotmail, Live and Microsoft 365 accounts."
    : null;
}

// ── "Outlook only for now" copy (marketing, 26 Oct 2026) ──────────────────────
// Used only while the connectable providers are exactly Outlook. If Gmail is
// re-enabled the provider-aware phrasing above returns; with nothing
// configured the neutral fallback stays.
export const OUTLOOK_ONLY_TITLE = "Import from Outlook";
export const OUTLOOK_ONLY_BODY =
  "Connect your Outlook inbox and Receebo finds your receipts for you. You approve each one before it's saved. Outlook only for now; more email providers are coming.";
export const OUTLOOK_ONLY_CONNECT_NOTE =
  "Email import works with Outlook for now. Using another email? Save the receipt as a PDF and upload it.";
export const OUTLOOK_ONLY_FAQ = {
  q: "Which email providers work?",
  a: "For now, only Outlook (including Hotmail and Live accounts). For any other email, save the receipt or order confirmation as a PDF and upload it.",
};

/** True when the only connectable (enabled) provider is Outlook. */
export function isOutlookOnly(providers: Array<{ id: string; enabled?: boolean }>): boolean {
  const ids = providers.filter((p) => p.enabled !== false).map((p) => p.id);
  return ids.length === 1 && ids[0] === "outlook";
}
