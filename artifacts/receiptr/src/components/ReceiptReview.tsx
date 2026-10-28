import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReceipt, useUpdateReceipt, getGetReceiptQueryKey, getListReceiptsQueryKey,
  getGetReceiptStatsQueryKey, getGetRecentReceiptsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { CATEGORIES, categoryIcon, categoryStyle } from "@/lib/categories";
import { privateFileUrl } from "@/lib/privateFileUrl";
import { formatMoney, formatPurchaseDate } from "@/lib/pendingImports";
import { useToast } from "@/hooks/use-toast";
import { usePwaUpdateBlocker } from "@/lib/pwa";

interface ReviewFields {
  merchant: string;
  purchaseDate: string;
  category: string;
  total: string;
  warranty: string;
}

const label = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const field = "border-0 px-0 h-auto py-0 font-medium focus-visible:ring-0 shadow-none";

/**
 * Short review right after accepting an email import (/receipts/:id?review=1):
 * the receipt is already saved; this lets the user fix the basics and go on.
 */
export function ReceiptReview({ receiptId, doneHref }: { receiptId: number; doneHref: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: receipt, isLoading, isError } = useGetReceipt(receiptId, {
    query: { enabled: receiptId > 0, queryKey: getGetReceiptQueryKey(receiptId) },
  });
  const updateReceipt = useUpdateReceipt();
  const [fields, setFields] = useState<ReviewFields | null>(null);
  const [initial, setInitial] = useState<ReviewFields | null>(null);

  useEffect(() => {
    if (receipt && !initial) {
      const f = {
        merchant: receipt.merchant ?? "",
        purchaseDate: receipt.purchaseDate ?? "",
        category: receipt.category ?? "Other",
        total: receipt.total != null ? String(receipt.total) : "",
        warranty: receipt.warranty ?? "",
      };
      setFields(f);
      setInitial(f);
    }
  }, [receipt, initial]);

  const dirty = !!fields && !!initial && (Object.keys(fields) as Array<keyof ReviewFields>)
    .some((k) => fields[k] !== initial[k]);
  usePwaUpdateBlocker(dirty || updateReceipt.isPending);

  const set = (k: keyof ReviewFields) => (v: string) => setFields((f) => (f ? { ...f, [k]: v } : f));

  const done = async () => {
    if (dirty && fields) {
      const total = fields.total.trim() === "" ? undefined : Number(fields.total);
      try {
        await updateReceipt.mutateAsync({
          id: receiptId,
          data: {
            merchant: fields.merchant,
            purchaseDate: fields.purchaseDate,
            category: fields.category,
            warranty: fields.warranty,
            ...(total !== undefined && Number.isFinite(total) ? { total } : {}),
          },
        });
        void queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
        void queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      } catch {
        toast({ title: "Error", description: "Failed to update receipt.", variant: "destructive" });
        return;
      }
    }
    setLocation(doneHref);
  };

  if (isLoading || (!fields && !isError)) {
    return (
      <div className="w-full max-w-lg mx-auto px-5 py-6 space-y-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  if (isError || !receipt || !fields) {
    return (
      <div className="w-full max-w-lg mx-auto px-5 py-16 text-center">
        <p className="font-semibold mb-4">Receipt not found</p>
        <Button className="rounded-full" onClick={() => setLocation(doneHref)}>Back</Button>
      </div>
    );
  }

  const Icon = categoryIcon(fields.category);
  const products = receipt.products ?? [];

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col min-h-full" data-testid="receipt-review">
      <div className="px-5 pt-6 pb-4 border-b space-y-4">
        <button
          type="button"
          onClick={() => setLocation(doneHref)}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(fields.category)}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight truncate">{receipt.merchant || receipt.originalFileName}</h1>
            <p className="text-sm text-muted-foreground">{formatPurchaseDate(receipt.purchaseDate)}</p>
          </div>
          <p className="text-lg font-bold font-mono shrink-0 self-end">{formatMoney(receipt.total, receipt.currency)}</p>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5 flex-1 pb-28">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center gap-2 text-sm font-semibold" role="status">
          <CheckCircle2 className="w-4 h-4 text-violet-700" />
          Added to your receipts
        </div>

        <div className="rounded-2xl border divide-y">
          <div className="p-4 space-y-1">
            <label className={label} htmlFor="review-merchant">Merchant</label>
            <Input id="review-merchant" value={fields.merchant} onChange={(e) => set("merchant")(e.target.value)} className={`${field} font-semibold`} />
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div className="p-4 space-y-1">
              <label className={label} htmlFor="review-date">Date</label>
              <Input id="review-date" type="date" value={fields.purchaseDate} onChange={(e) => set("purchaseDate")(e.target.value)} className={field} />
            </div>
            <div className="p-4 space-y-1">
              <span className={label}>Category</span>
              <Select value={fields.category} onValueChange={set("category")}>
                <SelectTrigger aria-label="Category" className="border-0 px-0 h-auto py-0 font-medium shadow-none focus:ring-0 [&>svg]:ml-1">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryStyle(cat)}`}>{cat}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div className="p-4 space-y-1">
              <label className={label} htmlFor="review-total">Total</label>
              <Input id="review-total" type="number" step="0.01" value={fields.total} onChange={(e) => set("total")(e.target.value)} className={`${field} font-mono font-semibold`} />
            </div>
            <div className="p-4 space-y-1">
              <label className={label} htmlFor="review-warranty">Warranty</label>
              <Input id="review-warranty" value={fields.warranty} placeholder="None" onChange={(e) => set("warranty")(e.target.value)} className={field} />
            </div>
          </div>
        </div>

        {products.length > 0 && (
          <div>
            <p className={`${label} mb-2 flex items-center gap-1.5`}>
              <Package className="w-3.5 h-3.5" /> Items · {products.length}
            </p>
            <div className="rounded-2xl border divide-y">
              {products.map((p, i) => (
                <div key={i} className="px-4 py-3 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    {p.name}
                    {p.quantity != null && <span className="text-xs text-muted-foreground"> ×{p.quantity}</span>}
                  </span>
                  {p.price != null && <span className="font-mono font-semibold shrink-0">{formatMoney(p.price, receipt.currency)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className={`${label} mb-2 flex items-center gap-1.5`}>
            <FileText className="w-3.5 h-3.5" /> Original receipt
          </p>
          <ReceiptPreview fileUrl={privateFileUrl(receipt.objectPath)} fileName={receipt.originalFileName} />
        </div>
      </div>

      <div className="sticky bottom-0 border-t bg-background px-5 py-3">
        <Button className="w-full rounded-full h-11" onClick={done} disabled={updateReceipt.isPending} data-testid="review-done">
          {updateReceipt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Done
        </Button>
      </div>
    </div>
  );
}
