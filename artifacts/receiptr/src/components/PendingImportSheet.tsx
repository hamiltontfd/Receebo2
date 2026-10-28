import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, Clock, FileText, Loader2, Mail, Package, Scale, Sparkles, X, AlertTriangle } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, categoryIcon, categoryStyle } from "@/lib/categories";
import { BILLING_QUERY_KEY, isAtTrialCap, type BillingStatus } from "@/hooks/useBilling";
import { usePendingImportActions } from "@/hooks/usePendingImportActions";
import { MAIL_PROVIDER_LABELS } from "@/lib/mailConnection";
import { deriveConsumerRights } from "@/lib/consumerRights";
import { getAppLocale } from "@/lib/locale";
import { hasNoConsumerDates, type PurchaseType } from "@/lib/purchaseType";
import { Switch } from "@/components/ui/switch";
import { TRIAL_CAP_BUTTON, TRIAL_CAP_MESSAGE, SUBSCRIBE_HREF } from "@/lib/trialCopy";
import {
  fetchPendingDetail, formatMoney, formatPurchaseDate, pendingDetailQueryKey,
  type PendingImportDetail,
} from "@/lib/pendingImports";

interface PendingImportSheetProps {
  importId: number | null;
  open: boolean;
  onClose: () => void;
}

/** Side panel from 768 px up (same breakpoint as ReceiptSheet); tolerant of environments without matchMedia. */
function useIsDesktop() {
  const query = "(min-width: 768px)";
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/** "View original": fetch the stored PDF as an authenticated blob, open it in a new tab. */
function ViewOriginalButton({ url }: { url: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobUrl(null);
    customFetch<Blob>(`${url}?private-cache=no-store`, { responseType: "blob", cache: "no-store" })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  const open = useCallback(() => { if (blobUrl) window.open(blobUrl, "_blank"); }, [blobUrl]);
  return (
    <button
      type="button"
      onClick={open}
      disabled={!blobUrl}
      data-testid="pending-view-original"
      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-semibold shrink-0 disabled:opacity-50"
    >
      <FileText className="w-3.5 h-3.5" />
      View original
    </button>
  );
}

const NO_DATES_BADGE: Record<string, string> = {
  subscription: "Subscription", digital: "Digital", ticket: "Ticket", service: "Service",
};

function SheetBody({ detail, category, onCategory, purchaseType, onPurchaseType }: {
  detail: PendingImportDetail;
  category: string;
  onCategory: (c: string) => void;
  purchaseType: PurchaseType | null;
  onPurchaseType: (t: PurchaseType) => void;
}) {
  const data = detail.extraction;
  const provider = detail.provider ? MAIL_PROVIDER_LABELS[detail.provider] : "your email";
  const products = data.products ?? [];
  const rights = deriveConsumerRights({
    purchaseDate: data.purchaseDate,
    deliveryDate: data.deliveryDate,
    category,
    currency: data.currency,
    purchaseCountry: data.purchaseCountry,
    isOnlinePurchase: data.isOnlinePurchase,
    merchant: data.merchant,
    warrantyText: data.warranty,
    purchaseType,
    locale: getAppLocale(),
  });
  const noDates = hasNoConsumerDates(purchaseType);
  const suggested = (data.category ?? "Other") === category;

  return (
    <div className="px-5 py-5 space-y-5">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-background border flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Found in {provider}</p>
          <p className="text-xs text-muted-foreground">
            Found {formatPurchaseDate(detail.createdAt)}
          </p>
        </div>
        <ViewOriginalButton url={detail.originalUrl} />
      </div>

      <div className="rounded-2xl border px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
          {suggested && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Suggested
            </span>
          )}
        </div>
        <Select value={category} onValueChange={onCategory}>
          <SelectTrigger
            aria-label="Category"
            data-testid="pending-category"
            className="border-0 px-0 h-auto py-1 font-medium shadow-none focus:ring-0 [&>svg]:ml-1 justify-between"
          >
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryStyle(cat)}`}>{cat}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-between gap-3 pt-2 mt-2 border-t">
          <label htmlFor="pending-switch-subscription" className="text-sm font-medium flex items-center gap-2">
            This is a subscription
            {noDates && purchaseType && (
              <span data-testid="pending-purchase-type" className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {NO_DATES_BADGE[purchaseType]}
              </span>
            )}
          </label>
          <Switch
            id="pending-switch-subscription"
            data-testid="pending-switch-subscription"
            checked={noDates}
            onCheckedChange={(on) => onPurchaseType(on ? "subscription" : "goods")}
          />
        </div>
        {noDates && rights.notes[0] && (
          <p className="text-xs text-muted-foreground pt-1" data-testid="pending-no-dates-note">{rights.notes[0]}</p>
        )}
      </div>

      {products.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> Items · {products.length}
          </p>
          <div className="rounded-2xl border divide-y">
            {products.map((p, i) => (
              <div key={i} className="px-4 py-3 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  {p.name}
                  {p.quantity != null && <span className="text-xs text-muted-foreground"> ×{p.quantity}</span>}
                </span>
                {p.price != null && <span className="font-mono font-semibold shrink-0">{formatMoney(p.price, data.currency)}</span>}
              </div>
            ))}
            {data.total != null && (
              <div className="px-4 py-3 flex items-baseline justify-between bg-muted/40 text-sm font-semibold">
                <span>Total</span>
                <span className="font-mono">{formatMoney(data.total, data.currency)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {data.notableItems.length > 0 && (
        <div className="rounded-2xl border border-foreground/20 bg-foreground/5 px-4 py-3" data-testid="pending-notable">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2">Worth keeping for</p>
          <ul className="space-y-1.5">
            {data.notableItems.map((n, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold">{n.name}</span>
                <span className="text-xs text-muted-foreground"> · {n.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rights.warranty && !rights.warranty.isExpired && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            Consumer Rights{rights.countryLabel ? ` · ${rights.countryLabel}` : ""}
          </p>
          <div className="rounded-xl border px-4 py-3 flex items-start gap-3 bg-violet-50 border-violet-200 text-violet-700">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold leading-tight">{rights.warranty.label}</p>
              <p className="text-xs mt-0.5 opacity-80">
                Until {rights.warranty.formattedExpiry} · tracked once you accept
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only preview of a pending email import (bottom sheet on mobile, side
 * panel on desktop). The category can be changed before accepting; Accept
 * saves it and opens the short review screen.
 */
export function PendingImportSheet({ importId, open, onClose }: PendingImportSheetProps) {
  const isDesktop = useIsDesktop();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { approve, dismiss, busy } = usePendingImportActions();
  const { data: billing } = useQuery<BillingStatus>({ queryKey: BILLING_QUERY_KEY, enabled: false });
  const atCap = isAtTrialCap(billing);

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: pendingDetailQueryKey(importId ?? 0),
    queryFn: () => fetchPendingDetail(importId!),
    enabled: open && importId != null,
    retry: false,
    staleTime: 60_000,
  });

  const [category, setCategory] = useState<string>("Other");
  // Detected type; the switch overrides it (sent only when changed, saved as manual).
  const [purchaseType, setPurchaseType] = useState<PurchaseType | null>(null);
  useEffect(() => {
    if (detail) {
      setCategory(detail.extraction.category ?? "Other");
      setPurchaseType(detail.purchaseType ?? null);
    }
  }, [detail]);

  const handleAccept = () => {
    if (!detail) return;
    const from = typeof window !== "undefined" ? window.location.pathname : "";
    const typeChanged = purchaseType !== null && purchaseType !== (detail.purchaseType ?? null);
    approve.mutate({ id: detail.id, category, ...(typeChanged ? { purchaseType } : {}) }, {
      onSuccess: ({ receiptId }) => {
        queryClient.removeQueries({ queryKey: pendingDetailQueryKey(detail.id) });
        onClose();
        setLocation(`/receipts/${receiptId}?review=1${from.endsWith("/imports") ? "&from=imports" : ""}`);
      },
    });
  };

  const handleDismiss = () => {
    if (!detail) return;
    dismiss.mutate(detail.id, { onSuccess: onClose });
  };

  const data = detail?.extraction;
  const HeaderIcon = categoryIcon(category);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        data-testid="pending-sheet"
        className={
          isDesktop
            ? "w-[440px] max-w-full px-0 pt-0 pb-0 flex flex-col gap-0 overflow-hidden [&>button]:hidden"
            : "h-[85dvh] rounded-t-2xl px-0 pt-0 pb-0 flex flex-col gap-0 overflow-hidden [&>button]:hidden"
        }
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {!isDesktop && (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
          </div>
        )}
        <SheetDescription className="sr-only">Receipt found in your email</SheetDescription>

        {isLoading || (!detail && !isError) ? (
          <div className="px-5 py-4 space-y-4">
            <SheetTitle className="sr-only">Loading</SheetTitle>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ) : isError || !detail || !data ? (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <SheetTitle className="sr-only">Not found</SheetTitle>
            <AlertTriangle className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="font-semibold mb-1">This receipt is no longer waiting</p>
            <p className="text-sm text-muted-foreground mb-5">It was already accepted or dismissed.</p>
            <Button className="rounded-full" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 px-5 py-4 border-b shrink-0">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(category)}`}>
                <HeaderIcon className="w-[1.1rem] h-[1.1rem]" />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="font-bold text-base leading-tight truncate">
                  {data.merchant ?? detail.originalFileName}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">{formatPurchaseDate(data.purchaseDate)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
                <p className="font-bold font-mono">{formatMoney(data.total, data.currency)}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <SheetBody
                detail={detail}
                category={category}
                onCategory={setCategory}
                purchaseType={purchaseType}
                onPurchaseType={setPurchaseType}
              />
            </div>

            <div className="border-t px-5 py-3 shrink-0 space-y-2 bg-background">
              {atCap && (
                <p className="text-xs text-amber-900 flex flex-wrap gap-1" data-testid="pending-sheet-trial-cap">
                  {TRIAL_CAP_MESSAGE}
                  <a href={SUBSCRIBE_HREF} onClick={(e) => { e.preventDefault(); onClose(); setLocation(SUBSCRIBE_HREF); }} className="font-semibold underline">
                    {TRIAL_CAP_BUTTON}
                  </a>
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="flex-1 rounded-full h-11"
                  disabled={busy}
                  onClick={handleDismiss}
                >
                  {dismiss.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Dismiss
                </Button>
                <Button
                  className="flex-[1.4] rounded-full h-11"
                  disabled={busy || atCap}
                  onClick={handleAccept}
                  data-testid="pending-sheet-accept"
                >
                  {approve.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Accept
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
