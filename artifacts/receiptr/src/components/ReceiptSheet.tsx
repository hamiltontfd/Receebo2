import { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2, Trash2, Edit2, Share2, AlertTriangle, ScanLine,
  Paperclip, FileText, ArrowLeft, Maximize2,
} from "lucide-react";

import {
  useGetReceipt,
  useUpdateReceipt,
  useDeleteReceipt,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetReceiptStatsQueryKey,
  getGetRecentReceiptsQueryKey,
  useCreateAttachment,
  useDeleteAttachment,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { StoreFullscreen } from "@/components/StoreFullscreen";
import { currencySymbol } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, categoryStyle, categoryIcon } from "@/lib/categories";
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

interface ReceiptSheetProps {
  receiptId: number | null;
  open: boolean;
  onClose: () => void;
}

export function ReceiptSheet({ receiptId, open, onClose }: ReceiptSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createAttachment = useCreateAttachment();
  const deleteAttachmentMutation = useDeleteAttachment();

  const { data: receipt, isLoading, isError } = useGetReceipt(
    receiptId ?? 0,
    {
      query: {
        enabled: receiptId != null && receiptId > 0,
        queryKey: getGetReceiptQueryKey(receiptId ?? 0),
        refetchInterval: (query) =>
          query.state.data?.status === "processing" ? 2000 : false,
      },
    },
  );

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

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setStoreUrl(null);
    }
  }, [open]);

  const onSubmit = async (data: EditFormValues) => {
    if (!receiptId) return;
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
    if (!receiptId) return;
    try {
      await deleteReceipt.mutateAsync({ id: receiptId });
      toast({ title: "Receipt deleted", description: "Removed from your library." });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      onClose();
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
    } catch {}
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!receiptId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploadInfo = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        },
      );
      await fetch(uploadInfo.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      await createAttachment.mutateAsync({
        receiptId,
        data: {
          objectPath: uploadInfo.objectPath,
          originalFileName: file.name,
          contentType: file.type || "application/octet-stream",
        },
      });
      toast({ title: "File attached", description: `${file.name} added to this receipt.` });
    } catch {
      toast({ title: "Upload failed", description: "Could not attach the file.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!receiptId) return;
    setDeletingAttachmentId(attachmentId);
    try {
      await deleteAttachmentMutation.mutateAsync({ receiptId, attachmentId });
      toast({ title: "File removed", description: "Attachment deleted." });
    } catch {
      toast({ title: "Error", description: "Could not remove attachment.", variant: "destructive" });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const fileUrl = receipt
    ? `${import.meta.env.BASE_URL}api/storage${receipt.objectPath}`
    : "";
  const isProcessing = receipt?.status === "processing";
  const symbol = currencySymbol(receipt?.currency);
  const isImage = receipt?.contentType.startsWith("image/") ?? false;

  const hasHighlights = (receipt?.notableItems?.length ?? 0) > 0;

  return (
    <>
      <AnimatePresence>
        {storeUrl && (
          <StoreFullscreen fileUrl={storeUrl} onClose={() => setStoreUrl(null)} />
        )}
      </AnimatePresence>

      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent
          side="bottom"
          className="h-[85dvh] rounded-t-2xl px-0 pt-0 pb-0 flex flex-col gap-0 overflow-hidden"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="px-5 py-4 space-y-5">
                <div className="flex items-center justify-between py-1">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-36 rounded-xl" />
              </div>
            ) : isError || !receipt ? (
              <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
                <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold mb-2">Receipt not found</h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  The receipt doesn't exist or you don't have access to it.
                </p>
                <Button className="rounded-full" onClick={onClose}>Dismiss</Button>
              </div>
            ) : (
              <>
                {/* ── Header ── */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                    aria-label="Close"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  {(() => {
                    const HeaderIcon = categoryIcon(receipt.category);
                    return (
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(receipt.category)}`}>
                        <HeaderIcon className="w-[1.1rem] h-[1.1rem]" />
                      </span>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate leading-tight">
                      {receipt.merchant || receipt.originalFileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {receipt.purchaseDate
                        ? format(new Date(receipt.purchaseDate), "MMM d, yyyy")
                        : format(new Date(receipt.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  {receipt.category && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${categoryStyle(receipt.category)}`}>
                      {receipt.category}
                    </span>
                  )}
                </div>

                {/* ── Total ── */}
                {!isEditing && (
                  <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
                    {(() => {
                      const TotalIcon = categoryIcon(receipt.category);
                      return (
                        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${categoryStyle(receipt.category)}`}>
                          {isProcessing
                            ? <Loader2 className="w-5 h-5 animate-spin" />
                            : <TotalIcon className="w-[1.375rem] h-[1.375rem]" />
                          }
                        </span>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <p className="text-3xl font-extrabold font-mono tracking-tight leading-none">
                        {receipt.total != null ? `${symbol}${receipt.total.toFixed(2)}` : "--"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isProcessing ? "Extracting…" : "Total"}
                      </p>
                      {receipt.transactionNumber && (
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          #{receipt.transactionNumber}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Scrollable body ── */}
                <div className="px-5 py-5 space-y-6 pb-10">

                  {/* Edit form */}
                  {isEditing && (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="rounded-2xl border divide-y">
                          <FormField
                            control={form.control}
                            name="merchant"
                            render={({ field }) => (
                              <FormItem className="p-4 space-y-1">
                                <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merchant</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="e.g. Apple Store" className="border-0 px-0 h-auto py-0 font-semibold focus-visible:ring-0 shadow-none" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 divide-x">
                            <FormField
                              control={form.control}
                              name="purchaseDate"
                              render={({ field }) => (
                                <FormItem className="p-4 space-y-1">
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} className="border-0 px-0 h-auto py-0 font-medium focus-visible:ring-0 shadow-none" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="category"
                              render={({ field }) => (
                                <FormItem className="p-4 space-y-1">
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                                    <FormControl>
                                      <SelectTrigger className="border-0 px-0 h-auto py-0 font-medium shadow-none focus:ring-0 [&>svg]:ml-1">
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {CATEGORIES.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryStyle(cat)}`}>{cat}</span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="grid grid-cols-2 divide-x">
                            <FormField
                              control={form.control}
                              name="total"
                              render={({ field }) => (
                                <FormItem className="p-4 space-y-1">
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</FormLabel>
                                  <FormControl>
                                    <Input type="number" step="0.01" {...field} value={field.value ?? ""} className="border-0 px-0 h-auto py-0 font-mono font-semibold focus-visible:ring-0 shadow-none" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="currency"
                              render={({ field }) => (
                                <FormItem className="p-4 space-y-1">
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="USD" className="border-0 px-0 h-auto py-0 font-medium focus-visible:ring-0 shadow-none" />
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
                              <FormItem className="p-4 space-y-1">
                                <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Warranty</FormLabel>
                                <FormControl>
                                  <AutosizeTextarea {...field} placeholder="e.g. 2-year manufacturer warranty" minRows={2} className="border-0 px-0 shadow-none focus-visible:ring-0 resize-none" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-4">
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
                  )}

                  {/* ── Highlights carousel ── */}
                  {!isEditing && hasHighlights && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Highlights
                      </p>
                      <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-none -mx-5 px-5">
                        {receipt.notableItems!.map((item, i) => {
                          const CardIcon = categoryIcon(item.category);
                          return (
                            <div
                              key={i}
                              className="shrink-0 w-40 rounded-2xl border border-border p-4 flex flex-col gap-2 snap-start bg-background"
                            >
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
                                <CardIcon className="w-[1.1rem] h-[1.1rem]" />
                              </span>
                              <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
                              {item.price != null && (
                                <p className="font-mono font-bold text-base">{symbol}{item.price.toFixed(2)}</p>
                              )}
                              {item.reason && (
                                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-auto">{item.reason}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Summary ── */}
                  {!isEditing && receipt.summary && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Summary</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{receipt.summary}</p>
                    </div>
                  )}

                  {/* ── Items ── */}
                  {!isEditing && receipt.products && receipt.products.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Items</p>
                      <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                        {receipt.products.map((product, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 bg-background">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{product.name}</p>
                              {product.quantity && product.quantity > 1 && (
                                <p className="text-xs text-muted-foreground">Qty {product.quantity}</p>
                              )}
                            </div>
                            {product.price != null && (
                              <span className="font-mono text-sm font-semibold shrink-0">{symbol}{product.price.toFixed(2)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── Warranty ── */}
                  {!isEditing && receipt.warranty && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Warranty</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{receipt.warranty}</p>
                    </div>
                  )}

                  {/* ── Original receipt ── */}
                  {!isEditing && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Original Receipt</p>
                      <ReceiptPreview
                        fileUrl={fileUrl}
                        contentType={receipt.contentType}
                        fileName={receipt.originalFileName}
                        defaultExpanded
                      />
                      {isImage && (
                        <Button
                          variant="outline"
                          className="w-full rounded-full mt-2"
                          onClick={() => setStoreUrl(fileUrl)}
                        >
                          <ScanLine className="w-4 h-4 mr-2" />
                          Show to store
                        </Button>
                      )}
                    </div>
                  )}

                  {/* ── Files / Attachments ── */}
                  {!isEditing && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files</p>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {isUploading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Paperclip className="w-3.5 h-3.5" />
                          }
                          {isUploading ? "Uploading…" : "Attach"}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                      </div>
                      <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                        {/* Original file row */}
                        <li className="flex items-center gap-3 px-4 py-3 bg-background">
                          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{receipt.originalFileName}</span>
                          {isImage && (
                            <button
                              onClick={() => setStoreUrl(fileUrl)}
                              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                              aria-label="Show fullscreen"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            download={receipt.originalFileName}
                          >
                            Download
                          </a>
                        </li>

                        {/* Attachment rows */}
                        {receipt.attachments && receipt.attachments.map((att) => {
                          const attUrl = `${import.meta.env.BASE_URL}api/storage${att.objectPath}`;
                          const attIsImage = att.contentType.startsWith("image/");
                          const isDeleting = deletingAttachmentId === att.id;
                          return (
                            <li key={att.id} className="flex items-center gap-3 px-4 py-3 bg-background">
                              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 text-sm truncate">{att.originalFileName}</span>
                              {attIsImage && (
                                <button
                                  onClick={() => setStoreUrl(attUrl)}
                                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  aria-label="Show fullscreen"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <a
                                href={attUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                download={att.originalFileName}
                              >
                                Download
                              </a>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    disabled={isDeleting}
                                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 shrink-0"
                                    aria-label="Remove attachment"
                                  >
                                    {isDeleting
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <Trash2 className="w-3.5 h-3.5" />
                                    }
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove this file?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete <span className="font-medium">{att.originalFileName}</span>.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteAttachment(att.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* ── Actions ── */}
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
                          <Button
                            variant="outline"
                            className="flex-1 rounded-full text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/10"
                          >
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
                            <AlertDialogAction
                              onClick={handleDelete}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}

                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
