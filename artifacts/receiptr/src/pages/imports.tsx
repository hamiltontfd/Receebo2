import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Check, CheckCheck, Info, ListChecks, Loader2, Mail, RefreshCw, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageTransition } from "@/components/PageTransition";
import { PendingImportSheet } from "@/components/PendingImportSheet";
import { usePendingImports } from "@/components/PendingImports";
import { useMailStatus } from "@/components/MailConnections";
import { useToast } from "@/hooks/use-toast";
import { usePendingImportActions } from "@/hooks/usePendingImportActions";
import {
  BILLING_QUERY_KEY, isAtTrialCap, resolveAccessState, type BillingStatus,
} from "@/hooks/useBilling";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import { syncMail } from "@/lib/mailConnection";
import { SUBSCRIBE_HREF, TRIAL_CAP_BUTTON, TRIAL_CAP_MESSAGE, TRIAL_RECEIPT_LIMIT } from "@/lib/trialCopy";
import {
  DISMISS_UNDER_EUR, formatMoney, formatPurchaseDate, formatTotals,
  groupByMonth, itemCountLabel, itemsUnder, type PendingImportItem,
} from "@/lib/pendingImports";

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

/** Remaining no-card trial slots, or null when the account has no cap. */
export function trialSlotsLeft(billing: BillingStatus | undefined): number | null {
  if (!billing) return null;
  const state = resolveAccessState(billing);
  if (state === "trial_exhausted") return 0;
  if (state !== "account_trial") return null;
  return Math.max(0, billing.trialUploadsRemaining ?? 0);
}

function PendingRow({
  item, selecting, selected, busy, atCap, onToggle, onOpen, onAccept, onDismiss,
}: {
  item: PendingImportItem;
  selecting: boolean;
  selected: boolean;
  busy: boolean;
  atCap: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const Icon = categoryIcon(item.category);
  const meta = [formatPurchaseDate(item.purchaseDate), itemCountLabel(item.itemCount)].filter(Boolean).join(" · ");
  return (
    <li
      data-testid={`pending-row-${item.id}`}
      className={`rounded-2xl border bg-background px-4 py-3 flex items-center gap-3 transition-colors ${
        selected ? "border-foreground border-2" : ""
      }`}
    >
      {selecting ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${item.merchant ?? item.originalFileName}`}
          onClick={onToggle}
          className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center shrink-0 ${
            selected ? "bg-foreground border-foreground text-background" : "border-muted-foreground/30"
          }`}
        >
          {selected && <Check className="w-4 h-4" />}
        </button>
      ) : (
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
          <Icon className="w-[1.1rem] h-[1.1rem]" />
        </span>
      )}
      <button
        type="button"
        className="min-w-0 flex-1 text-left md:flex md:items-center md:gap-4"
        onClick={selecting ? onToggle : onOpen}
      >
        <div className="min-w-0 md:flex-1">
          <p className="font-semibold truncate">{item.merchant ?? item.originalFileName}</p>
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        </div>
        <span className={`inline-block mt-1.5 md:mt-0 text-xs font-medium px-2 py-0.5 rounded-full ${categoryStyle(item.category)}`}>
          {item.category ?? "Other"}
        </span>
      </button>
      <div className="flex flex-col md:flex-row md:items-center items-end gap-2 shrink-0">
        <p className="font-bold font-mono">{formatMoney(item.total, item.currency)}</p>
        {!selecting && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Dismiss"
              aria-label="Dismiss"
              disabled={busy}
              onClick={onDismiss}
              className="w-8 h-8 rounded-full bg-secondary text-muted-foreground flex items-center justify-center disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              title={atCap ? TRIAL_CAP_MESSAGE : "Add to library"}
              aria-label="Accept"
              disabled={busy || atCap}
              onClick={onAccept}
              className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** /imports: the whole "Found in your email" queue, grouped by month, with bulk actions. */
export default function ImportsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = usePendingImports();
  const { data: billing } = useQuery<BillingStatus>({ queryKey: BILLING_QUERY_KEY, enabled: false });
  const { data: mailStatus } = useMailStatus();
  const { approve, dismiss, bulkApprove, bulkDismiss, busy } = usePendingImportActions();

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmUnder, setConfirmUnder] = useState(false);

  const items = data?.items ?? [];
  const count = data?.count ?? items.length;
  const groups = useMemo(() => groupByMonth(items), [items]);
  const under = useMemo(() => itemsUnder(items), [items]);
  const slotsLeft = trialSlotsLeft(billing);
  const atCap = isAtTrialCap(billing);
  const providers = (mailStatus?.providers ?? []).filter((p) => p.enabled && p.connected).map((p) => p.label);

  const sync = useMutation({
    mutationFn: () => syncMail(BASE),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["mail"] });
      if (result.needsReconnect?.length) {
        toast({ title: "Reconnect needed", description: "Your email connection expired. Reconnect it in Settings.", variant: "destructive" });
      } else if (result.queued > 0) {
        toast({ title: `Found ${result.queued} new receipt${result.queued > 1 ? "s" : ""}` });
      } else {
        toast({ title: "No new receipts found" });
      }
    },
    onError: () => toast({ title: "Sync failed", description: "Could not reach your inbox. Try again shortly.", variant: "destructive" }),
  });

  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = items.length > 0 && selected.size === items.length;
  // Keep the server's ranking order for the selected ids (trial cap fills best first).
  const selectedIds = items.filter((i) => selected.has(i.id)).map((i) => i.id);
  const k = selectedIds.length;
  const trialLimited = slotsLeft !== null && k > slotsLeft;

  const acceptSelected = () => bulkApprove.mutate(selectedIds, { onSuccess: exitSelect });
  const dismissSelected = () => bulkDismiss.mutate(selectedIds, { onSuccess: exitSelect });
  const dismissUnder = () => bulkDismiss.mutate(under.map((i) => i.id), { onSettled: () => setConfirmUnder(false) });

  const underTotal = formatTotals([{ currency: "EUR", amount: under.reduce((s, i) => s + (i.total ?? 0), 0) }]);

  return (
    <PageTransition className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 flex flex-col gap-4 pb-32">
      {selecting ? (
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="font-semibold" onClick={exitSelect}>Cancel</button>
          <span className="text-muted-foreground" data-testid="selected-count">{k} selected</span>
          <button
            type="button"
            className="font-semibold"
            onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
          >
            {allSelected ? "Select none" : "Select all"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/search"
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center md:w-auto md:h-auto md:bg-transparent md:gap-1.5 md:text-sm md:text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden md:inline">Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              aria-label="Sync"
            >
              {sync.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            {items.length > 0 && (
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setSelecting(true)}>
                <ListChecks className="w-4 h-4 mr-1.5" />
                Select
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="md:flex md:items-end md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Found in your email <span className="text-muted-foreground font-medium">({count})</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {providers.length > 0 ? `From ${providers.join(" and ")}. ` : ""}Worth keeping first.
          </p>
        </div>
        {!selecting && under.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full mt-3 md:mt-0"
            onClick={() => setConfirmUnder(true)}
            data-testid="dismiss-under-20"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Dismiss under €{DISMISS_UNDER_EUR}
          </Button>
        )}
      </div>

      {atCap && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950" data-testid="imports-trial-cap">
          <span>{TRIAL_CAP_MESSAGE}</span>
          <Link href={SUBSCRIBE_HREF} className="font-semibold underline">{TRIAL_CAP_BUTTON}</Link>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border px-4 py-6 text-center text-sm" data-testid="imports-empty">
          <Mail className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
          <p className="font-semibold">You're all caught up.</p>
          <p className="text-muted-foreground">New receipts from your email will show up here.</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} data-testid={`month-${group.key}`}>
            <div className="flex items-baseline justify-between mb-2 text-xs">
              <h2 className="font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
              <span className="text-muted-foreground">
                {group.items.length} item{group.items.length === 1 ? "" : "s"}
                {group.totals.length > 0 && <> · <span className="font-mono font-semibold text-foreground">{formatTotals(group.totals)}</span></>}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {group.items.map((item) => (
                <PendingRow
                  key={item.id}
                  item={item}
                  selecting={selecting}
                  selected={selected.has(item.id)}
                  busy={busy}
                  atCap={atCap}
                  onToggle={() => toggle(item.id)}
                  onOpen={() => setOpenId(item.id)}
                  onAccept={() => approve.mutate({ id: item.id })}
                  onDismiss={() => dismiss.mutate(item.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="max-w-lg md:max-w-3xl mx-auto space-y-2">
            {slotsLeft !== null && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5" data-testid="trial-slots-note">
                <Info className="w-3.5 h-3.5" />
                Trial: {slotsLeft} of {TRIAL_RECEIPT_LIMIT} receipts left. The rest stay here.
                <Link href={SUBSCRIBE_HREF} className="underline font-semibold text-foreground">Upgrade</Link>
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="flex-1 rounded-full h-11"
                disabled={k === 0 || busy}
                onClick={dismissSelected}
              >
                Dismiss
              </Button>
              <Button
                className="flex-[1.5] rounded-full h-11"
                disabled={k === 0 || busy || slotsLeft === 0}
                onClick={acceptSelected}
                data-testid="accept-selected"
              >
                {bulkApprove.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
                {trialLimited ? `Accept up to ${slotsLeft}` : `Accept selected (${k})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmUnder} onOpenChange={setConfirmUnder}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <span className="w-10 h-10 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </span>
            <AlertDialogTitle>
              Dismiss {under.length} item{under.length === 1 ? "" : "s"} under €{DISMISS_UNDER_EUR}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They add up to {underTotal} and won't be added to your receipts. Your emails stay in your inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="rounded-xl border divide-y max-h-56 overflow-y-auto text-sm" data-testid="dismiss-under-list">
            {under.map((i) => {
              const Icon = categoryIcon(i.category);
              return (
                <li key={i.id} className="px-3 py-2 flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${categoryStyle(i.category)}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 truncate">{i.merchant ?? i.originalFileName}</span>
                  <span className="font-mono font-semibold">{formatMoney(i.total, i.currency)}</span>
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 rounded-full mt-0">Cancel</AlertDialogCancel>
            <Button
              className="flex-1 rounded-full bg-[#DC2626] text-white hover:bg-[#DC2626]/90"
              disabled={bulkDismiss.isPending}
              onClick={dismissUnder}
              data-testid="confirm-dismiss-under"
            >
              {bulkDismiss.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Dismiss {under.length}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {openId != null && <PendingImportSheet importId={openId} open onClose={() => setOpenId(null)} />}
    </PageTransition>
  );
}

