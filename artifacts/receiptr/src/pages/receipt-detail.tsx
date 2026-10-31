import { actionWaitMessage, receiptPollInterval } from "@/lib/actionLimit";
import { appText, categoryText } from "@/lib/appCopy";
import { useAppLocale, formatLocaleDate } from "@/lib/locale";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRoute, Link, useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Loader2, Trash2, Edit2, Share2, AlertTriangle, ScanLine,
  Paperclip, FileText,
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

import { ReceiptPreview } from "@/components/ReceiptPreview";
import { ReceiptReview } from "@/components/ReceiptReview";
import { PurchaseCountryField, PurchaseCountryValue } from "@/components/PurchaseCountryField";
import { NotableItemsBanner } from "@/components/NotableItemsBanner";
import { StoreFullscreen } from "@/components/StoreFullscreen";
import { PageTransition, listVariants, itemVariants } from "@/components/PageTransition";
import { currencySymbol } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, categoryStyle, categoryIcon } from "@/lib/categories";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePwaUpdateBlocker } from "@/lib/pwa";
import { privateFileUrl } from "@/lib/privateFileUrl";
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
  purchaseCountry: z.string().nullable().optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;


export default function ReceiptDetail() {
  const [match, params] = useRoute("/receipts/:id");
  const receiptId = match ? parseInt(params.id) : 0;
  const search = new URLSearchParams(useSearch());
  // Just accepted from "Found in your email": show the short review instead.
  if (search.get("review") === "1") {
    return <ReceiptReview receiptId={receiptId} doneHref={search.get("from") === "imports" ? "/imports" : "/search"} />;
  }
  return <ReceiptDetailView receiptId={receiptId} />;
}

function ReceiptDetailView({ receiptId }: { receiptId: number }) {
  const locale = useAppLocale();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [retryAttachment, setRetryAttachment] = useState<File | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  usePwaUpdateBlocker(isEditing || isUploading || deletingAttachmentId !== null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createAttachment = useCreateAttachment();
  const deleteAttachmentMutation = useDeleteAttachment();

  const { data: receipt, isLoading, isError, error: receiptError } = useGetReceipt(receiptId, {
    query: {
      enabled: receiptId > 0,
      queryKey: getGetReceiptQueryKey(receiptId),
      refetchInterval: receiptPollInterval,
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
      purchaseCountry: null,
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
        purchaseCountry: receipt.purchaseCountry ?? null,
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
          purchaseCountry: data.purchaseCountry ?? null,
        },
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      toast({ title: appText("Receipt updated"), description: appText("Your changes have been saved.") });
    } catch {
      toast({ title: appText("Error"), description: appText("Failed to update receipt."), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReceipt.mutateAsync({ id: receiptId });
      toast({ title: appText("Receipt deleted"), description: appText("Removed from your library.") });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      setLocation("/search");
    } catch {
      toast({ title: appText("Error"), description: appText("Failed to delete receipt."), variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const summary = receipt
      ? `${receipt.merchant || receipt.originalFileName} - ${
          receipt.total != null
            ? `${currencySymbol(receipt.currency)}${receipt.total.toFixed(2)}`
            : ""
        } (${receipt.purchaseDate ? formatLocaleDate(new Date(receipt.purchaseDate), locale) : ""})`
      : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: appText("Receipt"), text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
        toast({ title: appText("Copied"), description: appText("Purchase details copied to clipboard.") });
      }
    } catch {
    }
  };

  const handleShowStore = useCallback(() => {
    setShowStore(true);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAttachment(file);
  };

  const uploadAttachment = async (file: File) => {
    setRetryAttachment(file);
    setIsUploading(true);
    try {
      const uploadInfo = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream", receiptId: Number(receiptId) }),
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
      toast({ title: appText("File attached"), description: appText("{0} added to this receipt.", [file.name]) });
      setRetryAttachment(null);
    } catch (error) {
      toast({ title: appText("Upload failed"), description: actionWaitMessage(error) ?? appText("Could not attach the file."), variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    setDeletingAttachmentId(attachmentId);
    try {
      await deleteAttachmentMutation.mutateAsync({ receiptId, attachmentId });
      toast({ title: appText("File removed"), description: appText("Attachment deleted.") });
    } catch {
      toast({ title: appText("Error"), description: appText("Could not remove attachment."), variant: "destructive" });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  if (isLoading) {
    return (
      <motion.div
        className="w-full max-w-lg mx-auto px-5 py-6 space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </motion.div>
    );
  }

  if (!receipt) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{appText(actionWaitMessage(receiptError) ? "Temporarily unavailable" : "Receipt not found")}</h2>
        <p className="text-muted-foreground mb-6">
          {actionWaitMessage(receiptError) ?? appText("The receipt you're looking for doesn't exist or you don't have access to it.")}
        </p>
        <Button className="rounded-full" onClick={() => setLocation("/search")}>
          {appText("Return to Library")}
        </Button>
      </div>
    );
  }

  const fileUrl = privateFileUrl(receipt.objectPath);
  const isProcessing = receipt.status === "processing";
  const symbol = currencySymbol(receipt.currency);
  const isImage = receipt.contentType.startsWith("image/");

  return (
    <>
      <AnimatePresence>
        {showStore && isImage && (
          <StoreFullscreen fileUrl={fileUrl} onClose={() => setShowStore(false)} />
        )}
      </AnimatePresence>

      <PageTransition className="w-full max-w-lg mx-auto px-5 py-6 flex flex-col gap-5">
        <div>
          <Link href="/search" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            {appText("Back")}
          </Link>
        </div>

        {/* Hero card */}
        <div className="rounded-2xl bg-foreground text-background p-6 space-y-4">
          <div>
            {(() => {
              const HeroIcon = categoryIcon(receipt.category);
              return (
                <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-lg px-2 py-1 mb-3">
                  <HeroIcon className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">{categoryText(receipt.category || "Other")}</span>
                </div>
              );
            })()}
            <h1 className="text-2xl font-extrabold tracking-tight">
              {receipt.merchant || receipt.originalFileName}
            </h1>
            <p className="text-sm opacity-70 mt-1">
              {receipt.merchant ? `${receipt.merchant} · ` : ""}
              {receipt.purchaseDate
                ? formatLocaleDate(new Date(receipt.purchaseDate), locale)
                : formatLocaleDate(new Date(receipt.createdAt), locale)}
            </p>
            {receipt.transactionNumber && (
              <p className="text-xs opacity-60 mt-1 font-mono">
                {appText("Txn #")}{receipt.transactionNumber}
              </p>
            )}
          </div>
          <p className="text-4xl font-extrabold tracking-tight font-mono">
            {receipt.total != null ? `${symbol}${receipt.total.toFixed(2)}` : "--"}
          </p>
          {isProcessing && (
            <p className="text-sm opacity-80 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {appText("AI is extracting details...")}
            </p>
          )}
        </div>

        {isEditing ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="rounded-2xl border divide-y">
                <FormField
                  control={form.control}
                  name="merchant"
                  render={({ field }) => (
                    <FormItem className="p-4 space-y-1">
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Merchant")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={appText("e.g. Apple Store")} className="border-0 px-0 h-auto py-0 font-semibold focus-visible:ring-0 shadow-none" />
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
                        <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Date")}</FormLabel>
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
                        <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Category")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger className="border-0 px-0 h-auto py-0 font-medium shadow-none focus:ring-0 [&>svg]:ml-1">
                              <SelectValue placeholder={appText("Select category")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryStyle(cat)}`}>{categoryText(cat)}</span>
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
                        <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Total")}</FormLabel>
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
                        <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Currency")}</FormLabel>
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
                  name="purchaseCountry"
                  render={({ field }) => (
                    <FormItem className="p-4">
                      <PurchaseCountryField value={field.value} onChange={field.onChange} id="detail-purchase-country" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="warranty"
                  render={({ field }) => (
                    <FormItem className="p-4 space-y-1">
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Warranty")}</FormLabel>
                      <FormControl>
                        <AutosizeTextarea {...field} placeholder={appText("e.g. 2-year manufacturer warranty")} minRows={3} className="border-0 px-0 shadow-none focus-visible:ring-0 resize-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Button type="submit" className="flex-1 rounded-full" disabled={updateReceipt.isPending}>
                  {updateReceipt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {appText("Save Changes")}
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsEditing(false)} disabled={updateReceipt.isPending}>
                  {appText("Cancel")}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <div className="rounded-2xl border divide-y">
            <div className="p-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">{appText("Category")}</span>
              {receipt.category ? (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryStyle(receipt.category)}`}>
                  {categoryText(receipt.category)}
                </span>
              ) : (
                <span className="font-semibold text-muted-foreground">{appText("None")}</span>
              )}
            </div>
            <div className="p-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">{appText("Date")}</span>
              <span className="font-semibold">
                {receipt.purchaseDate
                  ? formatLocaleDate(new Date(receipt.purchaseDate), locale)
                  : appText("Unknown")}
              </span>
            </div>
            {receipt.transactionNumber && (
              <div className="p-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">{appText("Transaction #")}</span>
                <span className="font-mono font-semibold">{receipt.transactionNumber}</span>
              </div>
            )}
            <div className="p-4 flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground font-medium">{appText("Purchase country")}</span>
              <PurchaseCountryValue value={receipt.purchaseCountry} className="font-semibold text-right" />
            </div>
            <div className="p-4 flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground font-medium">{appText("Warranty")}</span>
              <span className="font-semibold text-right">{receipt.warranty || appText("None")}</span>
            </div>
            <div className="p-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">{appText("Items")}</span>
              <span className="font-semibold">
                {(() => {
                  const count = receipt.products?.reduce((s, p) => s + (p.quantity || 1), 0) ?? 0;
                  return appText("{0} item(s)", [count]);
                })()}
              </span>
            </div>
          </div>
        )}

        {receipt.notableItems && receipt.notableItems.length > 0 && !isEditing && (
          <NotableItemsBanner items={receipt.notableItems} currency={receipt.currency} />
        )}

        {receipt.products && receipt.products.length > 0 && !isEditing && (
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {appText("Purchased")}
              </p>
              <p className="text-xs text-muted-foreground">
                {receipt.products.reduce((sum, p) => sum + (p.quantity && p.quantity > 1 ? p.quantity : 1), 0)} {appText("items total")}
              </p>
            </div>
            <motion.ul
              className="space-y-2"
              variants={listVariants}
              initial="hidden"
              animate="visible"
            >
              {receipt.products.map((product, i) => (
                <motion.li key={i} variants={itemVariants} className="flex justify-between text-sm">
                  <span>
                    {product.quantity && product.quantity > 1 ? `×${product.quantity} ` : ""}{product.name}
                  </span>
                  {product.price != null && (
                    <span className="font-mono font-medium">{symbol}{product.price.toFixed(2)}</span>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          </div>
        )}

        {receipt.summary && !isEditing && (
          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {appText("AI Summary")}
            </p>
            <p className="text-sm leading-relaxed">{receipt.summary}</p>
          </div>
        )}

        {/* Original receipt — compact row; "Open" shows the file in a new tab */}
        <ReceiptPreview
          fileUrl={fileUrl}
          fileName={receipt.originalFileName}
        />

        {/* Files section — primary scan + attachments */}
        {!isEditing && (
          <div className="rounded-2xl border divide-y">
            <div className="p-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {appText("Files")}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {isUploading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Paperclip className="w-3.5 h-3.5" />
                }
                {appText(isUploading ? "Uploading..." : "Attach file")}
              </button>
              {retryAttachment && !isUploading && (
                <Button variant="outline" onClick={() => void uploadAttachment(retryAttachment)}>
                  {appText("Retry saved file")}
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Primary scan */}
            <div className="px-4 py-3 flex items-center gap-3">
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm truncate">{receipt.originalFileName}</span>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                download={receipt.originalFileName}
              >
                {appText("View")}
              </a>
            </div>

            {/* Attachments */}
            {receipt.attachments && receipt.attachments.map((att) => {
              const attUrl = privateFileUrl(att.objectPath);
              const isDeleting = deletingAttachmentId === att.id;
              return (
                <div key={att.id} className="px-4 py-3 flex items-center gap-3">
                  <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm truncate">{att.originalFileName}</span>
                  <a
                    href={attUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    download={att.originalFileName}
                  >
                    {appText("View")}
                  </a>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        disabled={isDeleting}
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 shrink-0"
                        aria-label={appText("Remove attachment")}
                      >
                        {isDeleting
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{appText("Remove this file?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {appText("This will permanently delete")} <span className="font-medium">{att.originalFileName}</span> {appText("from this receipt.")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{appText("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {appText("Remove")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className="flex flex-col gap-2">
            {isImage && (
              <Button
                className="w-full rounded-full"
                onClick={handleShowStore}
              >
                <ScanLine className="w-4 h-4 mr-2" />
                {appText("Show to store")}
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-full"
                disabled={isProcessing}
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="w-4 h-4 mr-2" />
                {appText("Edit")}
              </Button>
              <Button variant="outline" className="flex-1 rounded-full" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                {appText("Share")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="flex-1 rounded-full text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4 mr-2" />
                    {appText("Delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{appText("Delete this receipt?")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {appText("This action cannot be undone. The receipt and all extracted data will be permanently removed.")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{appText("Cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {appText("Delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </PageTransition>
    </>
  );
}
