import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Loader2, Trash2, Edit2, Share2, AlertTriangle,
} from "lucide-react";

import {
  useGetReceipt,
  useUpdateReceipt,
  useDeleteReceipt,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetReceiptStatsQueryKey,
  getGetRecentReceiptsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { ReceiptPreview } from "@/components/ReceiptPreview";
import { NotableItemsBanner } from "@/components/NotableItemsBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const editFormSchema = z.object({
  merchant: z.string().optional(),
  purchaseDate: z.string().optional(),
  total: z.coerce.number().optional(),
  currency: z.string().optional(),
  category: z.string().optional(),
  warranty: z.string().optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

function currencySymbol(currency?: string | null): string {
  if (!currency || currency === "USD") return "$";
  if (currency === "EUR") return "\u20AC";
  if (currency === "GBP") return "\u00A3";
  return `${currency} `;
}

export default function ReceiptDetail() {
  const [match, params] = useRoute("/receipts/:id");
  const receiptId = match ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);

  const { data: receipt, isLoading, isError } = useGetReceipt(receiptId, {
    query: {
      enabled: receiptId > 0,
      queryKey: getGetReceiptQueryKey(receiptId),
      refetchInterval: (query) =>
        query.state.data?.status === "processing" ? 2000 : false,
    },
  });

  const updateReceipt = useUpdateReceipt();
  const deleteReceipt = useDeleteReceipt();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      merchant: "",
      purchaseDate: "",
      total: undefined,
      currency: "USD",
      category: "",
      warranty: "",
    },
  });

  useEffect(() => {
    if (receipt && !isEditing) {
      form.reset({
        merchant: receipt.merchant || "",
        purchaseDate: receipt.purchaseDate || "",
        total: receipt.total || undefined,
        currency: receipt.currency || "USD",
        category: receipt.category || "",
        warranty: receipt.warranty || "",
      });
    }
  }, [receipt, isEditing, form]);

  const onSubmit = async (data: EditFormValues) => {
    try {
      await updateReceipt.mutateAsync({
        id: receiptId,
        data: {
          merchant: data.merchant,
          purchaseDate: data.purchaseDate,
          total: data.total,
          currency: data.currency,
          category: data.category,
          warranty: data.warranty,
        },
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      toast({ title: "Receipt updated", description: "Your changes have been saved." });
    } catch {
      toast({ title: "Error", description: "Failed to update receipt.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReceipt.mutateAsync({ id: receiptId });
      toast({ title: "Receipt deleted", description: "Removed from your library." });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      setLocation("/library");
    } catch {
      toast({ title: "Error", description: "Failed to delete receipt.", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const summary = receipt
      ? `${receipt.merchant || receipt.originalFileName} - ${
          receipt.total != null
            ? `${currencySymbol(receipt.currency)}${receipt.total.toFixed(2)}`
            : ""
        } (${receipt.purchaseDate ? format(new Date(receipt.purchaseDate), "MMM d, yyyy") : ""})`
      : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Receipt", text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
        toast({ title: "Copied", description: "Purchase details copied to clipboard." });
      }
    } catch {
      // User cancelled the share sheet; nothing to do
    }
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-lg mx-auto px-5 py-6 space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError || !receipt) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Receipt not found</h2>
        <p className="text-muted-foreground mb-6">
          The receipt you're looking for doesn't exist or you don't have access to it.
        </p>
        <Button className="rounded-full" onClick={() => setLocation("/library")}>
          Return to Library
        </Button>
      </div>
    );
  }

  const fileUrl = `${import.meta.env.BASE_URL}api/storage${receipt.objectPath}`;
  const isProcessing = receipt.status === "processing";
  const symbol = currencySymbol(receipt.currency);

  return (
    <div className="w-full max-w-lg mx-auto px-5 py-6 flex flex-col gap-5">
      <div>
        <Link href="/library" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl bg-foreground text-background p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {receipt.merchant || receipt.originalFileName}
          </h1>
          <p className="text-sm opacity-70 mt-1">
            {receipt.merchant ? `${receipt.merchant} · ` : ""}
            {receipt.purchaseDate
              ? format(new Date(receipt.purchaseDate), "MMM d, yyyy")
              : format(new Date(receipt.createdAt), "MMM d, yyyy")}
          </p>
        </div>
        <p className="text-4xl font-extrabold tracking-tight font-mono">
          {receipt.total != null ? `${symbol}${receipt.total.toFixed(2)}` : "--"}
        </p>
        {isProcessing && (
          <p className="text-sm opacity-80 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            AI is extracting details...
          </p>
        )}
      </div>

      {isEditing ? (
        <div className="rounded-2xl border p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="merchant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Merchant</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Apple Store" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="purchaseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Electronics" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="USD" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="warranty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warranty</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. 2-year manufacturer warranty" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center gap-2 pt-2">
                <Button type="submit" className="flex-1 rounded-full" disabled={updateReceipt.isPending}>
                  {updateReceipt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsEditing(false)} disabled={updateReceipt.isPending}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </div>
      ) : (
        <div className="rounded-2xl border divide-y">
          <div className="p-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Category</span>
            <span className="font-semibold capitalize">{receipt.category || "None"}</span>
          </div>
          <div className="p-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Date</span>
            <span className="font-semibold">
              {receipt.purchaseDate
                ? format(new Date(receipt.purchaseDate), "MMMM d, yyyy")
                : "Unknown"}
            </span>
          </div>
          <div className="p-4 flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground font-medium">Warranty</span>
            <span className="font-semibold text-right">{receipt.warranty || "None"}</span>
          </div>
          <div className="p-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Items</span>
            <span className="font-semibold">
              {receipt.products?.length || 0} item{(receipt.products?.length || 0) === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

      {receipt.notableItems && receipt.notableItems.length > 0 && !isEditing && (
        <NotableItemsBanner items={receipt.notableItems} />
      )}

      {receipt.products && receipt.products.length > 0 && !isEditing && (
        <div className="rounded-2xl border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Purchased
          </p>
          <ul className="space-y-2">
            {receipt.products.map((product, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span>
                  {product.name}
                  {product.quantity && product.quantity > 1 ? ` × ${product.quantity}` : ""}
                </span>
                {product.price != null && (
                  <span className="font-mono font-medium">${product.price.toFixed(2)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {receipt.summary && !isEditing && (
        <div className="rounded-2xl bg-secondary p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            AI Summary
          </p>
          <p className="text-sm leading-relaxed">{receipt.summary}</p>
        </div>
      )}

      {/* Original receipt — inline preview with collapsible wrapper on mobile */}
      <ReceiptPreview
        fileUrl={fileUrl}
        contentType={receipt.contentType}
        fileName={receipt.originalFileName}
      />

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            disabled={isProcessing}
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" className="flex-1 rounded-full" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="flex-1 rounded-full text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/10">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The receipt and all extracted data will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
