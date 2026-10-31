import { appText } from "@/lib/appCopy";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { BILLING_QUERY_KEY } from "@/hooks/useBilling";
import { subscribeToastAction } from "@/components/SubscribeToastAction";
import { SYNC_IN_PROGRESS_COPY } from "@/lib/mailImportCopy";
import { TRIAL_CAP_MESSAGE } from "@/lib/trialCopy";
import { getAppLocale } from "@/lib/locale";
import { ToastAction } from "@/components/ui/toast";
import {
  AlreadyHandledError, PENDING_QUERY_KEY, RECURRING_QUERY_KEY, SyncInProgressError, TrialCapError,
  alwaysImportSupplier, approvePending, bulkApprovePending, bulkDismissPending, dismissPending,
  type PendingList,
} from "@/lib/pendingImports";

/** Drop handled ids from the cached list right away so the next card slides in. */
function removeFromCache(queryClient: ReturnType<typeof useQueryClient>, ids: number[]) {
  const gone = new Set(ids);
  queryClient.setQueryData<PendingList>(PENDING_QUERY_KEY, (old) => {
    if (!old) return old;
    const items = old.items.filter((i) => !gone.has(i.id));
    return { ...old, items, count: items.length };
  });
}

/**
 * Approve / dismiss (single and bulk) with the shared toasts:
 * "Receipt added to your library", "Dismissed", the trial cap with Subscribe,
 * and the neutral "still syncing" message on 409 SYNC_IN_PROGRESS.
 */
export function usePendingImportActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: PENDING_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["receipts"] });
    void queryClient.invalidateQueries({ queryKey: ["mail", "status"] });
  };

  const showError = (err: unknown, fallback: string) => {
    if (err instanceof TrialCapError) {
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      toast({
        title: appText("Receipt not added"),
        description: appText(TRIAL_CAP_MESSAGE),
        variant: "destructive",
        action: subscribeToastAction(setLocation),
      });
      return;
    }
    if (err instanceof SyncInProgressError) {
      toast({ title: SYNC_IN_PROGRESS_COPY[getAppLocale()] });
      return;
    }
    if (err instanceof AlreadyHandledError) {
      refresh();
      return;
    }
    toast({ title: appText("Something went wrong"), description: appText(fallback), variant: "destructive" });
  };

  const approve = useMutation({
    mutationFn: approvePending,
    onSuccess: (_result, { id }) => {
      removeFromCache(queryClient, [id]);
      refresh();
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      toast({ title: appText("Receipt added to your library") });
    },
    onError: (err) => showError(err, "Could not approve receipt. Please try again."),
  });

  const dismiss = useMutation({
    mutationFn: dismissPending,
    onSuccess: (_result, id) => {
      removeFromCache(queryClient, [id]);
      refresh();
      toast({ title: appText("Dismissed") });
    },
    onError: (err) => showError(err, "Could not dismiss import."),
  });

  const bulkApprove = useMutation({
    mutationFn: bulkApprovePending,
    onSuccess: (result) => {
      removeFromCache(queryClient, result.approved.map((a) => a.id));
      refresh();
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      const n = result.approved.length;
      const added = appText("{0} receipt(s) added", [n]);
      if (result.code === "TRIAL_UPLOAD_LIMIT" && result.skipped.length > 0) {
        const rest = result.skipped.length;
        toast({
          title: added,
          description: appText("Subscribe to add the other {0}. They stay here.", [rest]),
          action: subscribeToastAction(setLocation),
        });
        return;
      }
      toast({ title: added });
    },
    onError: (err) => showError(err, "Could not add these receipts. Please try again."),
  });

  const bulkDismiss = useMutation({
    mutationFn: bulkDismissPending,
    onSuccess: (result) => {
      removeFromCache(queryClient, result.dismissed);
      refresh();
      const n = result.dismissed.length;
      if (result.failed.length > 0) {
        toast({
          title: appText("Dismissed {0}", [n]),
          description: appText("{0} could not be removed. Try again in a moment.", [result.failed.length]),
          variant: "destructive",
        });
        return;
      }
      toast({ title: n === 1 ? appText("Dismissed") : appText("Dismissed {0}", [n]) });
    },
    onError: (err) => showError(err, "Could not dismiss these imports."),
  });

  // "Always import" a recurring supplier: this receipt plus all its pending ones.
  const alwaysImport = useMutation({
    mutationFn: alwaysImportSupplier,
    onSuccess: (result) => {
      removeFromCache(queryClient, result.approved.map((a) => a.id));
      refresh();
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: RECURRING_QUERY_KEY });
      const added = appText("{0} added", [result.approved.length]);
      toast({
        title: appText("{0} receipts will now import automatically", [result.supplier.displayName]),
        description: result.skipped.length > 0 ? appText("{0} · {1} still waiting", [added, result.skipped.length]) : added,
        action: (
          <ToastAction altText={appText("Manage")} onClick={() => setLocation("/profile/recurring")} data-testid="toast-action-manage">
            {appText("Manage")}
          </ToastAction>
        ),
      });
    },
    onError: (err) => showError(err, "Could not import from this supplier. Please try again."),
  });

  const busy = approve.isPending || dismiss.isPending || bulkApprove.isPending || bulkDismiss.isPending || alwaysImport.isPending;
  return { approve, dismiss, bulkApprove, bulkDismiss, alwaysImport, busy };
}
