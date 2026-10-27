/**
 * Frozen (paused) accounts: the trial ended unpaid or the plan lapsed.
 * No new receipts, imports or alerts, and no in-app export. Data is deleted
 * 60 days after access ended unless the user subscribes (server:
 * api-server/src/lib/accountLifecycle.ts, spec: docs/account-lifecycle.md).
 *
 * Translations (not wired up yet):
 *   pt-PT: "Os seus recibos ficam guardados até {data} e depois são apagados. Subscreva antes disso para os manter."
 *          "Quer uma cópia? Escreva para contact@receebo.net."
 *   pt-BR: "Suas notas ficam guardadas até {data} e depois são apagadas. Assine antes disso para mantê-las."
 *          "Quer uma cópia? Escreva para contact@receebo.net."
 */
import { hasAppAccess, resolveAccessState, type BillingStatus } from "@/hooks/useBilling";

export const SUPPORT_EMAIL = "contact@receebo.net";
export const FROZEN_COPY_NOTE = `Want a copy of your data? Email ${SUPPORT_EMAIL} and we'll send it to you.`;
export const FROZEN_EXPORT_NOTE =
  `Your account is paused, so in-app export is off. Email ${SUPPORT_EMAIL} and we'll send you a copy of your data.`;

export function isFrozenAccount(b: BillingStatus | undefined | null): boolean {
  if (!b || hasAppAccess(b)) return false;
  const state = resolveAccessState(b);
  return state === "trial_expired" || state === "subscription_required";
}

export function formatDeletionDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One-line retention notice for the paywall, or null when not frozen. */
export function frozenRetentionNotice(b: BillingStatus | undefined | null): string | null {
  if (!isFrozenAccount(b)) return null;
  const date = formatDeletionDate(b!.dataDeletionAt);
  return date
    ? `Your receipts are kept until ${date}, then permanently deleted. Subscribe before then to keep them.`
    : "Your receipts are kept for 60 days after your access ended, then permanently deleted. Subscribe before then to keep them.";
}
