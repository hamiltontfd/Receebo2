import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Mail, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useMailStatus } from "@/components/MailConnections";
import { MAIL_PROVIDER_LABELS, syncMail, type MailProviderId } from "@/lib/mailConnection";
import { BILLING_QUERY_KEY, isAtTrialCap, type BillingStatus } from "@/hooks/useBilling";
import { subscribeToastAction } from "@/components/SubscribeToastAction";
import { TRIAL_CAP_MESSAGE, TRIAL_CAP_BUTTON, SUBSCRIBE_HREF } from "@/lib/trialCopy";

/** The server refused the approval because the free-trial receipt cap is reached. */
export class TrialCapError extends Error {
  constructor() { super(TRIAL_CAP_MESSAGE); }
}

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

export interface PendingImportItem {
  id: number;
  provider?: MailProviderId;
  gmailMessageId: string;
  originalFileName: string;
  merchant: string | null;
  total: number | null;
  currency: string | null;
  purchaseDate: string | null;
  category: string | null;
  summary: string | null;
  createdAt: string;
}

async function fetchPending(): Promise<PendingImportItem[]> {
  const res = await fetch(`${BASE}api/mail/pending`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load pending imports");
  return res.json() as Promise<PendingImportItem[]>;
}

async function approvePending(id: number): Promise<{ approved: boolean; receiptId: number }> {
  const res = await fetch(`${BASE}api/mail/pending/${id}/approve`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    if (res.status === 403 && (body?.code === "trial_exhausted" || body?.code === "TRIAL_UPLOAD_LIMIT")) {
      throw new TrialCapError();
    }
    throw new Error("Failed to approve");
  }
  return res.json() as Promise<{ approved: boolean; receiptId: number }>;
}

async function dismissPending(id: number): Promise<void> {
  const res = await fetch(`${BASE}api/mail/pending/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to dismiss");
}

function triggerSync() {
  return syncMail(BASE);
}

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null) return "";
  const sym =
    currency === "EUR"
      ? "€"
      : currency === "GBP"
        ? "£"
        : currency === "USD"
          ? "$"
          : currency
            ? `${currency} `
            : "";
  return `${sym}${amount.toFixed(2)}`;
}

export function usePendingImportCount() {
  const { data } = useQuery<PendingImportItem[]>({
    queryKey: ["mail", "pending"],
    queryFn: fetchPending,
    staleTime: 60_000,
    retry: false,
  });
  return data?.length ?? 0;
}

export default function PendingImports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  // Read the billing status from the shared cache (fetched by the app shell).
  const { data: billing } = useQuery<BillingStatus>({ queryKey: BILLING_QUERY_KEY, enabled: false });
  const atCap = isAtTrialCap(billing);

  const { data: items = [], isLoading } = useQuery<PendingImportItem[]>({
    queryKey: ["mail", "pending"],
    queryFn: fetchPending,
    staleTime: 60_000,
    retry: false,
  });

  const approve = useMutation({
    mutationFn: approvePending,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mail", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
      toast({ title: "Receipt added to your library" });
    },
    onError: (err) => {
      if (err instanceof TrialCapError) {
        void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
        toast({
          title: "Receipt not added",
          description: TRIAL_CAP_MESSAGE,
          variant: "destructive",
          action: subscribeToastAction(setLocation),
        });
        return;
      }
      toast({
        title: "Something went wrong",
        description: "Could not approve receipt. Please try again.",
        variant: "destructive",
      });
    },
  });

  const dismiss = useMutation({
    mutationFn: dismissPending,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mail", "pending"] });
    },
    onError: () =>
      toast({
        title: "Something went wrong",
        description: "Could not dismiss import.",
        variant: "destructive",
      }),
  });

  const { data: mailStatus } = useMailStatus();
  const reconnectProviders = (mailStatus?.providers ?? []).filter(
    (p) => p.enabled && p.connected && p.needsReconnect,
  );

  const sync = useMutation({
    mutationFn: triggerSync,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["mail"] });
      if (result.needsReconnect?.length) {
        toast({
          title: "Reconnect needed",
          description: "Your email connection expired. Reconnect it in Settings.",
          variant: "destructive",
        });
      } else if (result.queued > 0) {
        toast({
          title: `Found ${result.queued} new receipt${result.queued > 1 ? "s" : ""}`,
          description: "Review them below.",
        });
      } else {
        toast({ title: "No new receipts found" });
      }
    },
    onError: () =>
      toast({
        title: "Sync failed",
        description: "Could not reach your inbox. Try again shortly.",
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Checking inbox…</span>
      </div>
    );
  }

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

  if (items.length === 0) {
    return reconnectBanner ? <div className="mb-6">{reconnectBanner}</div> : null;
  }

  return (
    <div className="mb-6">
      {reconnectBanner}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">
            Found in your email
            <span className="ml-1.5 bg-foreground text-background text-xs font-bold rounded-full px-1.5 py-0.5">
              {items.length}
            </span>
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground rounded-full"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          {sync.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-1" />
          )}
          Sync
        </Button>
      </div>

      {atCap && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950" data-testid="pending-trial-cap">
          <span>{TRIAL_CAP_MESSAGE}</span>
          <Link href={SUBSCRIBE_HREF} className="font-semibold underline" data-testid="link-pending-subscribe">
            {TRIAL_CAP_BUTTON}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 border rounded-xl px-4 py-3 bg-background"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {item.merchant ?? item.originalFileName}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {item.total !== null && (
                  <span className="text-xs font-semibold text-foreground">
                    {formatCurrency(item.total, item.currency)}
                  </span>
                )}
                {item.purchaseDate && (
                  <span className="text-xs text-muted-foreground">
                    {item.purchaseDate}
                  </span>
                )}
                {item.provider && MAIL_PROVIDER_LABELS[item.provider] && (
                  <span className="text-xs text-muted-foreground">
                    {MAIL_PROVIDER_LABELS[item.provider]}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Found{" "}
                  {formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8 rounded-full text-muted-foreground hover:text-destructive"
                disabled={dismiss.isPending || approve.isPending}
                onClick={() => dismiss.mutate(item.id)}
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                className="w-8 h-8 rounded-full"
                disabled={atCap || dismiss.isPending || approve.isPending}
                onClick={() => approve.mutate(item.id)}
                title={atCap ? TRIAL_CAP_MESSAGE : "Add to library"}
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
