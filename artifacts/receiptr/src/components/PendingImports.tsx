import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Mail, Loader2, AlertTriangle, ChevronRight, Repeat } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useMailStatus } from "@/components/MailConnections";
import { PendingImportSheet } from "@/components/PendingImportSheet";
import { BILLING_QUERY_KEY, isAtTrialCap, type BillingStatus } from "@/hooks/useBilling";
import { usePendingImportActions } from "@/hooks/usePendingImportActions";
import { TRIAL_CAP_MESSAGE, TRIAL_CAP_BUTTON, SUBSCRIBE_HREF } from "@/lib/trialCopy";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import {
  PENDING_QUERY_KEY, fetchPending, formatMoney, formatPurchaseDate, itemsSummary, recurringTitle, undecidedRecurring,
  type PendingImportItem, type PendingList,
} from "@/lib/pendingImports";

export {
  TrialCapError, SyncInProgressError, AlreadyHandledError, type PendingImportItem,
} from "@/lib/pendingImports";

export function usePendingImports() {
  return useQuery<PendingList>({
    queryKey: PENDING_QUERY_KEY,
    queryFn: fetchPending,
    staleTime: 60_000,
    retry: false,
  });
}

export function usePendingImportCount() {
  const { data } = usePendingImports();
  return data?.count ?? 0;
}

/** The one card shown on the home screen: the highest-ranked pending receipt. */
export function PendingImportCard({
  item, stacked, atCap, busy, onOpen, onAccept, onDismiss, onAlwaysImport,
}: {
  item: PendingImportItem;
  stacked: boolean;
  atCap: boolean;
  busy: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  /** Undecided recurring supplier: replaces Accept. */
  onAlwaysImport?: () => void;
}) {
  const Icon = categoryIcon(item.category);
  const summary = itemsSummary(item);
  const recurring = onAlwaysImport ? undecidedRecurring(item) : null;
  return (
    <div className="relative" data-testid="pending-home-card">
      <div className="relative z-10 rounded-2xl border bg-background p-4 shadow-sm">
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left"
          aria-label={`Review ${item.merchant ?? item.originalFileName}`}
          data-testid="pending-card-open"
        >
          <div className="flex items-start gap-3">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
              <Icon className="w-[1.1rem] h-[1.1rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{item.merchant ?? item.originalFileName}</p>
              {item.purchaseDate && (
                <p className="text-xs text-muted-foreground">{formatPurchaseDate(item.purchaseDate)}</p>
              )}
            </div>
            <p className="font-bold font-mono shrink-0">{formatMoney(item.total, item.currency)}</p>
          </div>
          <div className="flex items-center gap-2 mt-3 min-w-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${categoryStyle(item.category)}`}>
              {item.category ?? "Other"}
            </span>
            {summary && <span className="text-sm truncate">{summary}</span>}
          </div>
        </button>
        {recurring && (
          <div
            className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 flex items-center gap-2"
            data-testid="pending-recurring-banner"
          >
            <Repeat className="w-4 h-4 text-violet-700 shrink-0" aria-hidden />
            <p className="text-xs font-semibold">{recurringTitle(recurring)}</p>
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <Button
            variant="secondary"
            className="flex-1 rounded-full h-10"
            disabled={busy}
            onClick={onDismiss}
            title="Dismiss"
          >
            <X className="w-4 h-4 mr-1.5" />
            Dismiss
          </Button>
          {recurring ? (
            <Button
              className="flex-1 rounded-full h-10"
              disabled={atCap || busy}
              onClick={onAlwaysImport}
              title={atCap ? TRIAL_CAP_MESSAGE : "Import this and future receipts automatically"}
              data-testid="pending-card-always-import"
            >
              <Repeat className="w-4 h-4 mr-1.5" />
              Always import
            </Button>
          ) : (
            <Button
              className="flex-1 rounded-full h-10"
              disabled={atCap || busy}
              onClick={onAccept}
              title={atCap ? TRIAL_CAP_MESSAGE : "Add to library"}
            >
              <Check className="w-4 h-4 mr-1.5" />
              Accept
            </Button>
          )}
        </div>
      </div>
      {stacked && (
        <div aria-hidden data-testid="pending-stack-edges">
          <div className="mx-3 -mt-2 h-3 rounded-b-2xl border border-t-0 bg-background" />
          <div className="mx-6 -mt-1.5 h-2.5 rounded-b-2xl border border-t-0 bg-background" />
        </div>
      )}
    </div>
  );
}

/**
 * Home "Found in your email": one card at a time (best ranked first), a badge
 * with the total, "View all" to /imports when there are 2 or more, and a
 * compact "all caught up" line once the queue is empty.
 */
export default function PendingImports() {
  // Read the billing status from the shared cache (fetched by the app shell).
  const { data: billing } = useQuery<BillingStatus>({ queryKey: BILLING_QUERY_KEY, enabled: false });
  const atCap = isAtTrialCap(billing);
  const { data, isLoading } = usePendingImports();
  const { approve, dismiss, alwaysImport, busy } = usePendingImportActions();
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: mailStatus } = useMailStatus();
  const providers = mailStatus?.providers ?? [];
  const reconnectProviders = providers.filter((p) => p.enabled && p.connected && p.needsReconnect);
  const connectedProviders = providers.filter((p) => p.enabled && p.connected);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Checking inbox…</span>
      </div>
    );
  }

  const items = data?.items ?? [];
  const count = data?.count ?? items.length;
  const top = items[0];

  const reconnectBanner = reconnectProviders.length > 0 && (
    <div
      role="alert"
      data-testid="mail-reconnect-banner"
      className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex items-start justify-between gap-3"
    >
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        {reconnectProviders.map((p) => p.label).join(" and ")} stopped syncing. Reconnect to keep importing receipts.
      </p>
      <Link href="/settings" className="font-semibold underline shrink-0">
        Reconnect
      </Link>
    </div>
  );

  // Nothing pending and no mailbox connected: nothing to show.
  if (!top && connectedProviders.length === 0) {
    return reconnectBanner ? <div className="mb-6">{reconnectBanner}</div> : null;
  }

  const providerNames = connectedProviders.map((p) => p.label).join(" or ") || "your email";

  return (
    <section className="mb-6" data-testid="pending-imports">
      {reconnectBanner}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold flex items-center">
            Found in your email
            {count > 0 && (
              <span
                className="ml-1.5 bg-foreground text-background text-xs font-bold rounded-full px-1.5 py-0.5 leading-none"
                data-testid="pending-count-badge"
              >
                {count}
              </span>
            )}
          </h2>
        </div>
        {count >= 2 && (
          <Link
            href="/imports"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center"
            data-testid="link-view-all-imports"
          >
            View all
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {!top ? (
        <div
          className="rounded-2xl border px-4 py-3 flex items-center gap-3 text-sm"
          data-testid="pending-caught-up"
        >
          <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Check className="w-4 h-4" />
          </span>
          <p>
            <span className="font-semibold">You're all caught up.</span>{" "}
            <span className="text-muted-foreground">New receipts from {providerNames} will show up here.</span>
          </p>
        </div>
      ) : (
        <>
          {atCap && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950" data-testid="pending-trial-cap">
              <span>{TRIAL_CAP_MESSAGE}</span>
              <Link href={SUBSCRIBE_HREF} className="font-semibold underline" data-testid="link-pending-subscribe">
                {TRIAL_CAP_BUTTON}
              </Link>
            </div>
          )}
          <PendingImportCard
            key={top.id}
            item={top}
            stacked={count >= 2}
            atCap={atCap}
            busy={busy}
            onOpen={() => setOpenId(top.id)}
            onAccept={() => approve.mutate({ id: top.id })}
            onDismiss={() => dismiss.mutate(top.id)}
            onAlwaysImport={() => {
              const r = undecidedRecurring(top);
              if (r) alwaysImport.mutate({ supplierKey: r.supplierKey, id: top.id });
            }}
          />
        </>
      )}

      {openId != null && <PendingImportSheet importId={openId} open onClose={() => setOpenId(null)} />}
    </section>
  );
}
