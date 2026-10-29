import { actionWaitMessage, receiptPollInterval } from "@/lib/actionLimit";
import { appText, categoryText } from "@/lib/appCopy";
import { useState, useEffect, useRef } from "react";
import { usePwaUpdateBlocker } from "@/lib/pwa";
import { privateFileUrl } from "@/lib/privateFileUrl";
import { AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2, Trash2, Edit2, Share2, AlertTriangle, ScanLine,
  Paperclip, FileText, ArrowLeft, Maximize2, X,
  Sparkles, Package, Shield, Star, Scale, RotateCcw, Clock,
} from "lucide-react";
import { deriveConsumerRights, usRightsCopy } from "@/lib/consumerRights";
import { useAccountRegion } from "@/lib/region";
import { usStoreReturnWindow } from "@/lib/usStorePolicies";
import { useAppLocale, formatLocaleDate } from "@/lib/locale";
import { hasNoConsumerDates } from "@/lib/purchaseType";
import { Switch } from "@/components/ui/switch";
import { HighlightsRow } from "@/components/HighlightsRow";
import { PurchaseCountryField, PurchaseCountryValue } from "@/components/PurchaseCountryField";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

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
import { generateReceiptPdf } from "@/lib/generateReceiptPdf";
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
  deliveryDate: z.string().optional(),
  total: z.coerce.number().optional(),
  currency: z.string().optional(),
  category: z.string().optional(),
  warranty: z.string().optional(),
  /** US accounts: the store's return window in days ("" = use the store table). */
  returnDays: z.string().regex(/^\d{0,3}$/, "Days, 0 to 365").refine((v) => v === "" || Number(v) <= 365, "Days, 0 to 365").optional(),
  isOnlinePurchase: z.boolean().nullable().optional(),
  purchaseCountry: z.string().nullable().optional(),
  purchaseType: z.enum(["goods", "subscription", "digital", "service", "ticket"]).nullable().optional(),
});

/** Helper line under the switch when the type was detected as something other than a subscription. */
const NO_DATES_TYPE_LABEL: Record<string, string> = {
  digital: "Detected as a digital purchase (app, film or in-app).",
  ticket: "Detected as an event ticket.",
  service: "Detected as a service.",
};

type EditFormValues = z.infer<typeof editFormSchema>;

interface ReceiptSheetProps {
  receiptId: number | null;
  open: boolean;
  onClose: () => void;
}

export function ReceiptSheet({ receiptId, open, onClose }: ReceiptSheetProps) {
  const locale = useAppLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();

  const [isEditing, setIsEditing] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [retryAttachment, setRetryAttachment] = useState<File | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  usePwaUpdateBlocker(isEditing || isUploading || isOpeningStore || deletingAttachmentId !== null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createAttachment = useCreateAttachment();
  const deleteAttachmentMutation = useDeleteAttachment();

  const { data: receipt, isLoading, isError, error: receiptError } = useGetReceipt(
    receiptId ?? 0,
    {
      query: {
        enabled: receiptId != null && receiptId > 0,
        queryKey: getGetReceiptQueryKey(receiptId ?? 0),
        refetchInterval: receiptPollInterval,
      },
    },
  );

  const updateReceipt = useUpdateReceipt();
  const deleteReceipt = useDeleteReceipt();
  const { region, ready: regionReady } = useAccountRegion();
  const isUs = region === "US";

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      merchant: "",
      purchaseDate: "",
      deliveryDate: "",
      total: undefined,
      currency: "USD",
      category: "",
      warranty: "",
      returnDays: "",
      isOnlinePurchase: null,
      purchaseCountry: null,
      purchaseType: null,
    },
  });

  useEffect(() => {
    if (receipt && !isEditing) {
      form.reset({
        merchant: receipt.merchant || "",
        purchaseDate: receipt.purchaseDate || "",
        deliveryDate: receipt.deliveryDate || "",
        total: receipt.total || undefined,
        currency: receipt.currency || "USD",
        category: receipt.category || "",
        warranty: receipt.warranty || "",
        returnDays: receipt.returnDays != null ? String(receipt.returnDays) : "",
        isOnlinePurchase: receipt.isOnlinePurchase ?? null,
        purchaseCountry: receipt.purchaseCountry ?? null,
        purchaseType: receipt.purchaseType ?? null,
      });
    }
  }, [receipt, isEditing, form]);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setStoreUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open]);

  const openStoreView = async (apiUrl: string) => {
    setIsOpeningStore(true);
    try {
      const blob = await customFetch<Blob>(apiUrl, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(blob);
      setStoreUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return blobUrl;
      });
    } catch {
      toast({ title: appText("Error"), description: appText("Could not load image."), variant: "destructive" });
    } finally {
      setIsOpeningStore(false);
    }
  };

  const downloadFile = async (apiUrl: string, fileName: string) => {
    try {
      const blob = await customFetch<Blob>(apiUrl, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast({ title: appText("Error"), description: appText("Could not download file."), variant: "destructive" });
    }
  };

  const onSubmit = async (data: EditFormValues) => {
    if (!receiptId) return;
    try {
      await updateReceipt.mutateAsync({
        id: receiptId,
        data: {
          merchant: data.merchant,
          purchaseDate: data.purchaseDate,
          deliveryDate: data.deliveryDate ? data.deliveryDate : null,
          total: data.total,
          currency: data.currency,
          category: data.category,
          warranty: data.warranty,
          isOnlinePurchase: data.isOnlinePurchase,
          purchaseCountry: data.purchaseCountry ?? null,
          // US accounts only: the store window the user wrote ("" clears it). PT requests are unchanged.
          ...(isUs ? { returnDays: data.returnDays ? Number(data.returnDays) : null } : {}),
          // Only when the switch changed it: an untouched AI/hint type stays as detected.
          ...((data.purchaseType ?? null) !== (receipt?.purchaseType ?? null)
            ? { purchaseType: data.purchaseType ?? null }
            : {}),
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
    if (!receiptId) return;
    try {
      await deleteReceipt.mutateAsync({ id: receiptId });
      toast({ title: appText("Receipt deleted"), description: appText("Removed from your library.") });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      onClose();
    } catch {
      toast({ title: appText("Error"), description: appText("Failed to delete receipt."), variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!receipt) return;
    const merchant = receipt.merchant || receipt.originalFileName;
    const sym = currencySymbol(receipt.currency);
    try {
      const pdfBlob = await generateReceiptPdf(receipt, sym);
      const fileName = `${merchant.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-receipt.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({ files: [pdfFile], title: `${merchant} Receipt` });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: appText("Downloaded"), description: appText("{0} saved to your device.", [fileName]) });
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast({ title: appText("Error"), description: appText("Could not generate PDF."), variant: "destructive" });
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!receiptId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAttachment(file);
  };

  const uploadAttachment = async (file: File) => {
    if (!receiptId) return;
    setRetryAttachment(file);
    setIsUploading(true);
    try {
      const { compressImage, compressedFileName } = await import("@/lib/compressImage");
      const rawType = file.type || "application/octet-stream";
      const { blob, contentType } = await compressImage(file, rawType);
      const fileName = compressedFileName(file.name, contentType);
      const uploadInfo = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fileName, size: blob.size, contentType, receiptId: Number(receiptId) }),
        },
      );
      await fetch(uploadInfo.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      await createAttachment.mutateAsync({
        receiptId,
        data: {
          objectPath: uploadInfo.objectPath,
          originalFileName: fileName,
          contentType,
        },
      });
      toast({ title: appText("File attached"), description: appText("{0} added to this receipt.", [fileName]) });
      setRetryAttachment(null);
    } catch (error) {
      toast({ title: appText("Upload failed"), description: actionWaitMessage(error) ?? appText("Could not attach the file."), variant: "destructive" });
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
      toast({ title: appText("File removed"), description: appText("Attachment deleted.") });
    } catch {
      toast({ title: appText("Error"), description: appText("Could not remove attachment."), variant: "destructive" });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const fileUrl = receipt
    ? privateFileUrl(receipt.objectPath)
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
          side={isDesktop ? "right" : "bottom"}
          // Desktop: 576px (was capped at 384px by the sheet's sm:max-w-sm), never wider than the window.
          className={
            isDesktop
              ? "w-[576px] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] px-0 pt-0 pb-0 flex flex-col gap-0 overflow-hidden [&>button]:hidden"
              : "h-[85dvh] rounded-t-2xl px-0 pt-0 pb-0 flex flex-col gap-0 overflow-hidden"
          }
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
        >
          {/* Drag handle — mobile only */}
          {!isDesktop && (
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
            </div>
          )}

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
            ) : !receipt ? (
              <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
                <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold mb-2">{appText(actionWaitMessage(receiptError) ? "Temporarily unavailable" : "Receipt not found")}</h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  {actionWaitMessage(receiptError) ?? appText("The receipt doesn't exist or you don't have access to it.")}
                </p>
                <Button className="rounded-full" onClick={onClose}>{appText("Dismiss")}</Button>
              </div>
            ) : (
              <>
                {/* ── Header ── */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                    aria-label={appText("Close")}
                  >
                    {isDesktop ? <X className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                  </button>
                  {(() => {
                    const HeaderIcon = categoryIcon(receipt.category);
                    return (
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(receipt.category)}`}>
                        {isProcessing
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <HeaderIcon className="w-[1.1rem] h-[1.1rem]" />
                        }
                      </span>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate leading-tight">
                      {receipt.merchant || receipt.originalFileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {receipt.purchaseDate
                        ? formatLocaleDate(new Date(receipt.purchaseDate), locale)
                        : formatLocaleDate(new Date(receipt.createdAt), locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold font-mono leading-tight">
                      {receipt.total != null ? `${symbol}${receipt.total.toFixed(2)}` : ""}
                    </p>
                    {receipt.transactionNumber && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        #{receipt.transactionNumber}
                      </p>
                    )}
                  </div>
                </div>

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
                                        <SelectValue placeholder={appText("Select")} />
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
                            name="warranty"
                            render={({ field }) => (
                              <FormItem className="p-4 space-y-1">
                                <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Warranty")}</FormLabel>
                                <FormControl>
                                  <AutosizeTextarea {...field} placeholder={appText("e.g. 2-year manufacturer warranty")} minRows={2} className="border-0 px-0 shadow-none focus-visible:ring-0 resize-none" />
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
                              <PurchaseCountryField value={field.value} onChange={field.onChange} id="sheet-purchase-country" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="isOnlinePurchase"
                          render={({ field }) => (
                            <FormItem className="p-4 space-y-1">
                              <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Purchase type")}</FormLabel>
                              <div className="flex gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => field.onChange(field.value === true ? null : true)}
                                  className={[
                                    "flex-1 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                    field.value === true
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background border-border text-muted-foreground hover:text-foreground",
                                  ].join(" ")}
                                >
                                  {appText("🌐 Online")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => field.onChange(field.value === false ? null : false)}
                                  className={[
                                    "flex-1 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                    field.value === false
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background border-border text-muted-foreground hover:text-foreground",
                                  ].join(" ")}
                                >
                                  {appText("🏪 In-store")}
                                </button>
                              </div>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="purchaseType"
                          render={({ field }) => {
                            const checked = hasNoConsumerDates(field.value);
                            return (
                              <FormItem className="p-4 space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                  <FormLabel htmlFor="switch-subscription" className="text-sm font-medium">{appText("This is a subscription")}</FormLabel>
                                  <FormControl>
                                    <Switch
                                      id="switch-subscription"
                                      data-testid="switch-subscription"
                                      checked={checked}
                                      onCheckedChange={(on) => field.onChange(on ? "subscription" : "goods")}
                                    />
                                  </FormControl>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {checked && field.value && NO_DATES_TYPE_LABEL[field.value] ? `${appText(NO_DATES_TYPE_LABEL[field.value])} ` : ""}
                                  {appText("No return window, warranty or reminders for subscriptions, digital purchases and tickets.")}
                                </p>
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={form.control}
                          name="deliveryDate"
                          render={({ field }) => (
                            <FormItem className="p-4 space-y-1">
                              <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Delivered on (optional)")}</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ?? ""} data-testid="input-delivery-date" className="border-0 px-0 h-auto py-0 font-medium focus-visible:ring-0 shadow-none" />
                              </FormControl>
                              <p className="text-xs text-muted-foreground">{appText("Online orders: the return window counts from delivery.")}</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {isUs && (
                          <FormField
                            control={form.control}
                            name="returnDays"
                            render={({ field }) => {
                              const watched = form.watch(["merchant", "purchaseDate", "deliveryDate", "isOnlinePurchase", "category"]);
                              const suggestion = watched[1]
                                ? usStoreReturnWindow({
                                    merchant: watched[0], purchaseDate: watched[1], deliveryDate: watched[2] || null,
                                    isOnlinePurchase: watched[3], category: watched[4],
                                    itemNames: [...(receipt.notableItems ?? []), ...(receipt.products ?? [])].map((i) => i.name),
                                  })
                                : { status: "unknown" as const };
                              return (
                                <FormItem className="p-4 space-y-1">
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Store return window (optional)")}</FormLabel>
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input
                                        inputMode="numeric"
                                        {...field}
                                        value={field.value ?? ""}
                                        placeholder={suggestion.status === "window" ? String(suggestion.days) : "e.g. 30"}
                                        data-testid="input-return-days"
                                        className="w-20 border-0 px-0 h-auto py-0 font-medium focus-visible:ring-0 shadow-none"
                                      />
                                    </FormControl>
                                    <span className="text-sm text-muted-foreground">{appText("days")}</span>
                                    {suggestion.status === "window" && field.value !== String(suggestion.days) && (
                                      <button
                                        type="button"
                                        className="ml-auto text-xs font-semibold underline underline-offset-4"
                                        onClick={() => field.onChange(String(suggestion.days))}
                                      >
                                        {appText("Use {0} days", [suggestion.days])}
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground" data-testid="text-return-days-hint">
                                    {suggestion.status === "window"
                                      ? appText("Typical for {0}: {1} days. Leave empty to use the store's policy. Check your receipt.", [`${suggestion.store.name}${suggestion.rule === "standard" ? "" : ` (${suggestion.rule})`}`, suggestion.days])
                                      : suggestion.status === "no_fixed_window"
                                        ? appText("{0} has no fixed window for most items. Add one only if your receipt shows it.", [suggestion.store.name])
                                        : appText("We don't know this store's return window. Add it if you know it; online and in store.")}
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
                          />
                        )}
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
                  )}

                  {/* ── Highlights carousel ── */}
                  {!isEditing && hasHighlights && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5" />
                        {appText("Highlights")}
                      </p>
                      <HighlightsRow>
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
                      </HighlightsRow>
                    </div>
                  )}

                  {/* ── Summary ── */}
                  {!isEditing && receipt.summary && (
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        {appText("Summary")}
                      </p>
                      <p className="text-sm text-blue-900/70 leading-relaxed">{receipt.summary}</p>
                    </div>
                  )}

                  {/* ── Items ── */}
                  {!isEditing && receipt.products && receipt.products.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        {appText("Items")}
                      </p>
                      <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                        {receipt.products.map((product, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 bg-background">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{product.name}</p>
                              {product.quantity && product.quantity > 1 && (
                                <p className="text-xs text-muted-foreground">{appText("Qty")} {product.quantity}</p>
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

                  {!isEditing && (
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Purchase country")}</span>
                      <PurchaseCountryValue value={receipt.purchaseCountry} className="font-semibold text-right" />
                    </div>
                  )}

                  {/* ── Warranty ── */}
                  {!isEditing && receipt.warranty && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        {appText("Warranty")}
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{receipt.warranty}</p>
                    </div>
                  )}

                  {/* ── Consumer Rights ── */}
                  {!isEditing && regionReady && (() => {
                    const rights = deriveConsumerRights({
                      purchaseDate: receipt.purchaseDate,
                      deliveryDate: receipt.deliveryDate,
                      category: receipt.category,
                      currency: receipt.currency,
                      purchaseCountry: receipt.purchaseCountry,
                      isOnlinePurchase: receipt.isOnlinePurchase,
                      merchant: receipt.merchant,
                      warrantyText: receipt.warranty,
                      purchaseType: receipt.purchaseType,
                      locale,
                      region,
                      returnDays: receipt.returnDays,
                      itemNames: [...(receipt.notableItems ?? []), ...(receipt.products ?? [])].map((i) => i.name),
                    });
                    if (!rights.hasAny) return null;

                    const urgencyClass = {
                      green: "bg-emerald-50 border-emerald-200 text-emerald-700",
                      amber: "bg-amber-50 border-amber-200 text-amber-700",
                      red: "bg-red-50 border-red-200 text-red-700",
                      expired: "bg-muted border-border text-muted-foreground",
                    } as const;

                    return (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Scale className="w-3.5 h-3.5" />
                          {isUs ? usRightsCopy(locale).panelTitle : <>{appText("Consumer Rights")}{rights.countryLabel ? ` · ${rights.countryLabel}` : ""}</>}
                        </p>
                        {!receipt.purchaseCountry && (
                          <p className="mb-2 text-xs text-muted-foreground">
                            {appText("Purchase country is unknown. This guidance may use the receipt currency or merchant as an estimate, not a confirmed country.")}
                          </p>
                        )}
                        <div className="space-y-2">

                          {/* Return window */}
                          {rights.returnWindow && (
                            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${urgencyClass[rights.returnWindow.urgency]}`}>
                              <RotateCcw className="w-4 h-4 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-tight">
                                  {rights.returnWindow.isExpired
                                    ? appText("Return window expired")
                                    : appText("Return by {0}", [rights.returnWindow.formattedDeadline])}
                                </p>
                                <p className="text-xs mt-0.5 opacity-80">
                                  {rights.returnWindow.isExpired
                                    ? appText("Expired {0} day(s) ago", [Math.abs(rights.returnWindow.daysLeft)])
                                    : rights.returnWindow.daysLeft === 0
                                      ? appText("Last day to return")
                                      : appText("{0} day(s) left", [rights.returnWindow.daysLeft])}
                                  {" · "}{rights.returnWindow.source}
                                  {rights.returnWindow.startsFrom === "delivery" ? appText(" · from delivery") : ""}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Statutory warranty */}
                          {rights.warranty && (
                            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${rights.warranty.isExpired ? "bg-muted border-border text-muted-foreground" : "bg-violet-50 border-violet-200 text-violet-700"}`}>
                              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-tight">
                                  {rights.warranty.isExpired
                                    ? appText("{0} (expired)", [rights.warranty.label])
                                    : `${rights.warranty.label}`}
                                </p>
                                <p className="text-xs mt-0.5 opacity-80">
                                  {rights.warranty.kind === "complaint_deadline"
                                    ? rights.warranty.isExpired
                                      ? appText("Apparent defects: deadline passed {0} · {1}", [rights.warranty.formattedExpiry, rights.warranty.citation])
                                      : appText("Apparent defects: report by {0} · {1}", [rights.warranty.formattedExpiry, rights.warranty.citation])
                                    : rights.warranty.isExpired
                                      ? appText("Expired {0}", [rights.warranty.formattedExpiry])
                                      : appText("Valid until {0} · {1}", [rights.warranty.formattedExpiry, rights.warranty.citation])}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Manufacturer warranty: own end date, next to the legal one (never added) */}
                          {rights.manufacturerWarranty && (
                            <div
                              data-testid="card-manufacturer-warranty"
                              className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${rights.manufacturerWarranty.isExpired ? "bg-muted border-border text-muted-foreground" : "bg-sky-50 border-sky-200 text-sky-700"}`}
                            >
                              <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-tight">
                                  {rights.manufacturerWarranty.label}
                                </p>
                                <p className="text-xs mt-0.5 opacity-80">
                                  {rights.manufacturerWarranty.isExpired
                                    ? appText("Expired {0}", [rights.manufacturerWarranty.formattedExpiry])
                                    : appText("Until {0} · from the receipt", [rights.manufacturerWarranty.formattedExpiry])}
                                </p>
                              </div>
                            </div>
                          )}

                          {rights.notes.length > 0 && (
                            <ul className="space-y-1 px-1 text-xs leading-5 text-muted-foreground" data-testid="list-rights-notes">
                              {rights.notes.map((note) => <li key={note}>{note}</li>)}
                            </ul>
                          )}
                          <p className="px-1 text-[11px] leading-4 text-muted-foreground">
                            {rights.disclaimer}
                          </p>

                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Original receipt ── */}
                  {!isEditing && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        Original Receipt
                      </p>
                      <ReceiptPreview
                        fileUrl={fileUrl}
                        fileName={receipt.originalFileName}
                      />
                      {isImage && (
                        <Button
                          variant="outline"
                          className="w-full rounded-full mt-2"
                          onClick={() => openStoreView(fileUrl)}
                          disabled={isOpeningStore}
                        >
                          <ScanLine className="w-4 h-4 mr-2" />
                          {appText(isOpeningStore ? "Loading…" : "Show to store")}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* ── Files / Attachments ── */}
                  {!isEditing && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5" />
                          {appText("Files")}
                        </p>
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
                      <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                        {/* Original file row */}
                        <li className="flex items-center gap-3 px-4 py-3 bg-background">
                          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{receipt.originalFileName}</span>
                          {isImage && (
                            <button
                              onClick={() => openStoreView(fileUrl)}
                              disabled={isOpeningStore}
                              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-40"
                              aria-label="Show fullscreen"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => downloadFile(fileUrl, receipt.originalFileName)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          >
                            {appText("Download")}
                          </button>
                        </li>

                        {/* Attachment rows */}
                        {receipt.attachments && receipt.attachments.map((att) => {
                          const attUrl = privateFileUrl(att.objectPath);
                          const attIsImage = att.contentType.startsWith("image/");
                          const isDeleting = deletingAttachmentId === att.id;
                          return (
                            <li key={att.id} className="flex items-center gap-3 px-4 py-3 bg-background">
                              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 text-sm truncate">{att.originalFileName}</span>
                              {attIsImage && (
                                <button
                                  onClick={() => openStoreView(attUrl)}
                                  disabled={isOpeningStore}
                                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-40"
                                  aria-label="Show fullscreen"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => downloadFile(attUrl, att.originalFileName)}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                              >
                                {appText("Download")}
                              </button>
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
                                      {appText("This will permanently delete")} <span className="font-medium">{att.originalFileName}</span>.
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
                        {appText("Edit")}
                      </Button>
                      <Button variant="outline" className="flex-1 rounded-full" onClick={handleShare}>
                        <Share2 className="w-4 h-4 mr-2" />
                        {appText("Share")}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="flex-1 rounded-full text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/10"
                          >
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
                            <AlertDialogAction
                              onClick={handleDelete}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {appText("Delete")}
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
