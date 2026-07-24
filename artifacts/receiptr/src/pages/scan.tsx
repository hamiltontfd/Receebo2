import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Camera, Upload, Check, Loader2, X, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateReceipt,
  useUpdateReceipt,
  useDeleteReceipt,
  useGetReceipt,
  useGetDailyUploadCount,
  checkSimilarReceipt,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetReceiptStatsQueryKey,
  getGetRecentReceiptsQueryKey,
  getGetDailyUploadCountQueryKey,
  customFetch,
  ApiError,
  type SimilarReceiptMatch,
} from "@workspace/api-client-react";
import { NotableItemsBanner } from "@/components/NotableItemsBanner";
import { currencySymbol } from "@/lib/currency";
import { CATEGORIES, categoryStyle } from "@/lib/categories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Phase = "capture" | "reading" | "review" | "not_a_receipt";

const READING_STEPS: Array<{
  label: string;
  notFoundLabel: string;
  check: (r: { merchant?: string | null; purchaseDate?: string | null; products?: unknown[]; total?: number | null; warranty?: string | null }) => boolean;
}> = [
  {
    label: "Merchant found",
    notFoundLabel: "Merchant (not found)",
    check: (r) => r.merchant != null && r.merchant !== "",
  },
  {
    label: "Date detected",
    notFoundLabel: "Date (not found)",
    check: (r) => r.purchaseDate != null && r.purchaseDate !== "",
  },
  {
    label: "Products extracted",
    notFoundLabel: "Products (not found)",
    check: (r) => Array.isArray(r.products) && r.products.length > 0,
  },
  {
    label: "Total identified",
    notFoundLabel: "Total (not found)",
    check: (r) => r.total != null,
  },
  {
    label: "Warranty info",
    notFoundLabel: "Warranty (not on receipt)",
    check: (r) => r.warranty != null && r.warranty !== "",
  },
];

function useCameraStream(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setCameraError(false);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      })
      .catch(() => {
        if (!cancelled) setCameraError(true);
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraReady(false);
    };
  }, [enabled]);

  return { videoRef, cameraReady, cameraError };
}

export default function Scan() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("capture");
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [stepsDone, setStepsDone] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // On desktop, upload is the primary path; the camera is opt-in.
  const [isDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );
  const [cameraRequested, setCameraRequested] = useState(false);
  const cameraActive = phase === "capture" && (!isDesktop || cameraRequested);

  const { videoRef, cameraReady, cameraError } = useCameraStream(cameraActive);

  const [limitError, setLimitError] = useState<string | null>(null);
  const [similarMatches, setSimilarMatches] = useState<SimilarReceiptMatch[] | null>(null);
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);

  const createReceipt = useCreateReceipt();
  const updateReceipt = useUpdateReceipt();
  const deleteReceipt = useDeleteReceipt();

  const { data: dailyCount, refetch: refetchDailyCount } = useGetDailyUploadCount();

  const { data: receipt } = useGetReceipt(receiptId ?? 0, {
    query: {
      enabled: receiptId != null && phase === "reading",
      queryKey: getGetReceiptQueryKey(receiptId ?? 0),
      refetchInterval: (query) =>
        query.state.data?.status === "processing" ? 1500 : false,
    },
  });

  // Animate reading steps while processing
  useEffect(() => {
    if (phase !== "reading") return;
    setStepsDone(0);
    const interval = setInterval(() => {
      setStepsDone((n) => Math.min(n + 1, READING_STEPS.length - 1));
    }, 1200);
    return () => clearInterval(interval);
  }, [phase]);

  // Move to review (or not_a_receipt) when extraction finishes
  useEffect(() => {
    if (phase !== "reading" || !receipt) return undefined;
    if (receipt.status === "not_a_receipt") {
      setStepsDone(READING_STEPS.length);
      const t = setTimeout(() => setPhase("not_a_receipt"), 400);
      return () => clearTimeout(t);
    }
    if (receipt.status === "completed" || receipt.status === "failed") {
      setStepsDone(READING_STEPS.length);
      const t = setTimeout(() => setPhase("review"), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, receipt]);

  // Check for duplicate receipts when entering review with a completed receipt.
  // Only fires when all three fields (merchant, date, total) are present —
  // matching on a partial set would produce false positives.
  useEffect(() => {
    if (phase !== "review" || !receipt || receipt.status !== "completed") return;
    const { merchant, purchaseDate, total } = receipt;
    if (merchant == null || purchaseDate == null || total == null) return;
    setSimilarMatches(null);
    setDismissedDuplicate(false);
    checkSimilarReceipt({ merchant, purchaseDate, total }).then((matches) => {
      setSimilarMatches(matches);
    }).catch(() => {
      setSimilarMatches([]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, receipt?.id]);

  const [form, setForm] = useState({
    merchant: "",
    purchaseDate: "",
    total: "",
    category: "",
    warranty: "",
  });

  useEffect(() => {
    if (phase === "review" && receipt) {
      setForm({
        merchant: receipt.merchant ?? "",
        purchaseDate: receipt.purchaseDate ?? "",
        total: receipt.total != null ? String(receipt.total) : "",
        category: receipt.category ?? "",
        warranty: receipt.warranty ?? "",
      });
    }
  }, [phase, receipt]);

  const uploadFile = useCallback(
    async (blob: Blob, fileName: string, contentType: string) => {
      setLimitError(null);
      setUploading(true);
      try {
        const { uploadURL, objectPath } = await customFetch<{
          uploadURL: string;
          objectPath: string;
        }>(`${import.meta.env.BASE_URL}api/storage/uploads/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fileName, size: blob.size, contentType }),
        });

        const put = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        });
        if (!put.ok) throw new Error("Upload failed");

        const created = await createReceipt.mutateAsync({
          data: { objectPath, originalFileName: fileName, contentType },
        });
        refetchDailyCount();
        setReceiptId(created.id);
        setPhase("reading");
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setLimitError("You've reached your 5 receipt limit for today. Come back tomorrow.");
          refetchDailyCount();
        } else {
          toast({
            title: "Upload failed",
            description: "Could not upload the receipt. Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        setUploading(false);
      }
    },
    [createReceipt, toast, refetchDailyCount],
  );

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) uploadFile(blob, `scan-${Date.now()}.jpg`, "image/jpeg");
      },
      "image/jpeg",
      0.92,
    );
  }, [uploadFile, videoRef]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file, file.name, file.type || "application/octet-stream");
    }
    e.target.value = "";
  };

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
  };

  const handleSave = async () => {
    if (receiptId == null) return;
    try {
      await updateReceipt.mutateAsync({
        id: receiptId,
        data: {
          merchant: form.merchant || undefined,
          purchaseDate: form.purchaseDate || undefined,
          total: form.total !== "" ? Number(form.total) : undefined,
          category: form.category || undefined,
          warranty: form.warranty || undefined,
          isDraft: false,
        },
      });
      invalidateLists();
      queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
      toast({ title: "Purchase saved", description: "Added to your library." });
      setLocation(`/receipts/${receiptId}`);
    } catch {
      toast({
        title: "Error",
        description: "Failed to save the purchase.",
        variant: "destructive",
      });
    }
  };

  const handleRetake = async () => {
    if (receiptId != null) {
      try {
        await deleteReceipt.mutateAsync({ id: receiptId });
        invalidateLists();
      } catch {
        // Receipt may already be gone; continue with retake regardless
      }
    }
    setReceiptId(null);
    setPhase("capture");
  };

  const handleDiscard = async () => {
    if (receiptId != null) {
      try {
        await deleteReceipt.mutateAsync({ id: receiptId });
        invalidateLists();
      } catch {
        // Receipt may already be gone; navigate regardless
      }
    }
    setLocation("/");
  };

  return (
    <div className="flex-1 flex flex-col max-w-lg w-full mx-auto px-5 py-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {phase === "capture" && (
        <div className="flex-1 flex flex-col gap-6">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Scan receipt</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Place the receipt inside the frame, or upload a file.
                </p>
              </div>
              {dailyCount != null && (
                <div className="flex-shrink-0 flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full bg-secondary text-xs font-medium text-muted-foreground">
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{dailyCount.remaining}/{dailyCount.limit} left today</span>
                </div>
              )}
            </div>

            {limitError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Daily limit reached</p>
                  <p className="mt-0.5 text-destructive/80">{limitError}</p>
                </div>
              </div>
            )}
          </div>

          {isDesktop && !cameraRequested ? (
            <div className="flex-1 min-h-[340px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 p-8 text-center">
              <span className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                <Upload className="w-6 h-6 text-muted-foreground" />
              </span>
              <div className="space-y-1 max-w-xs">
                <p className="font-semibold">Upload a receipt</p>
                <p className="text-sm text-muted-foreground">
                  JPG, PNG, or PDF. We'll read the details for you.
                </p>
              </div>
              <Button
                className="rounded-full h-12 px-8 font-semibold"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || (dailyCount != null && dailyCount.remaining === 0)}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Upload receipt
              </Button>
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground"
                onClick={() => setCameraRequested(true)}
                disabled={uploading || (dailyCount != null && dailyCount.remaining === 0)}
              >
                <Camera className="w-4 h-4 mr-2" />
                Use camera instead
              </Button>
            </div>
          ) : (
          <div className="relative flex-1 min-h-[340px] rounded-2xl overflow-hidden bg-foreground">
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-background p-8 text-center">
                <Camera className="w-10 h-10 opacity-60" />
                <p className="text-sm opacity-80">
                  Camera is not available. Upload a photo or PDF of your receipt instead.
                </p>
                <Button
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || (dailyCount != null && dailyCount.remaining === 0)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload receipt
                </Button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Framing guide */}
                <div className="absolute inset-8 border-2 border-background/80 rounded-xl pointer-events-none" />
                <p className="absolute bottom-36 inset-x-0 text-center text-xs text-background/90">
                  Place the receipt inside the frame
                </p>
                <div className="absolute bottom-14 inset-x-0 flex items-center justify-center">
                  <button
                    aria-label="Capture receipt"
                    onClick={capturePhoto}
                    disabled={!cameraReady || uploading || (dailyCount != null && dailyCount.remaining === 0)}
                    className="w-16 h-16 rounded-full border-4 border-background bg-background/20 hover:bg-background/40 transition-colors disabled:opacity-40 flex items-center justify-center"
                  >
                    {uploading && <Loader2 className="w-6 h-6 text-background animate-spin" />}
                  </button>
                </div>
              </>
            )}
          </div>

          )}

          {(!isDesktop || cameraRequested) && !cameraError && (
            <Button
              variant="outline"
              className="rounded-full h-12"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || (dailyCount != null && dailyCount.remaining === 0)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload a file instead
            </Button>
          )}
        </div>
      )}

      {phase === "reading" && (
        <div className="flex-1 flex flex-col gap-8 pt-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Reading receipt</h1>
            <p className="text-sm text-muted-foreground mt-1">
              ReceiptAI is turning the image into a purchase.
            </p>
          </div>

          <div className="flex items-center justify-center py-10">
            <div className="w-20 h-28 rounded-lg border-2 border-dashed border-border flex items-center justify-center animate-pulse">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          </div>

          <ul className="space-y-4">
            {READING_STEPS.map((step, i) => {
              const extractionDone =
                receipt?.status === "completed" || receipt?.status === "failed";

              if (extractionDone && receipt) {
                const found = step.check(receipt);
                return (
                  <li key={step.label} className="flex items-center gap-3 text-sm">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                        found
                          ? "bg-foreground text-background border-foreground"
                          : "bg-destructive/10 text-destructive border-destructive/40"
                      }`}
                    >
                      {found ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </span>
                    <span
                      className={
                        found ? "text-foreground font-medium" : "text-destructive"
                      }
                    >
                      {found ? step.label : step.notFoundLabel}
                    </span>
                  </li>
                );
              }

              const done = i < stepsDone;
              return (
                <li key={step.label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                      done
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-transparent"
                    }`}
                  >
                    <Check className="w-3 h-3" />
                  </span>
                  <span className={done ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === "not_a_receipt" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-2">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h1 className="text-xl font-extrabold tracking-tight">No receipt found</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Receebo only works with purchase receipts and invoices. Make sure your photo clearly shows the receipt, not a random photo or other document.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              className="rounded-full h-12 font-semibold"
              onClick={handleRetake}
            >
              <Camera className="w-4 h-4 mr-2" />
              Try again
            </Button>
            <Button
              variant="ghost"
              className="rounded-full h-12 text-muted-foreground"
              onClick={() => setLocation("/")}
            >
              Go back
            </Button>
          </div>
        </div>
      )}

      {phase === "review" && (
        <div className="flex-1 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Review</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Check the details before saving.
            </p>
            {receipt?.status === "failed" && (
              <p className="text-sm text-destructive mt-2 flex items-center gap-2">
                <X className="w-4 h-4" />
                Automatic extraction failed. Enter the details manually.
              </p>
            )}
          </div>

          {similarMatches && similarMatches.length > 0 && !dismissedDuplicate && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    This looks like a receipt you've already saved
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {similarMatches[0].merchant && similarMatches[0].purchaseDate
                      ? `${similarMatches[0].merchant} on ${similarMatches[0].purchaseDate}`
                      : similarMatches[0].merchant ?? similarMatches[0].purchaseDate ?? "Matching receipt found"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full text-xs border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  onClick={() => setDismissedDuplicate(true)}
                >
                  Save anyway
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  onClick={handleDiscard}
                  disabled={deleteReceipt.isPending}
                >
                  {deleteReceipt.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Discard
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-5">
            <div className="rounded-xl border p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merchant</p>
              <Input
                value={form.merchant}
                onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))}
                placeholder="e.g. Apple Store"
                className="border-0 px-0 text-lg font-semibold focus-visible:ring-0 shadow-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</p>
                <Input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                  className="border-0 px-0 font-medium focus-visible:ring-0 shadow-none"
                />
              </div>
              <div className="rounded-xl border p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold text-muted-foreground select-none">
                    {currencySymbol(receipt?.currency)}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.total}
                    onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))}
                    placeholder="0.00"
                    className="border-0 px-0 font-mono font-semibold focus-visible:ring-0 shadow-none"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
              <Select
                value={form.category || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger className="border-0 px-0 h-auto py-0 font-medium shadow-none focus:ring-0 [&>svg]:ml-1">
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
            </div>

            <div className="rounded-xl border p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Warranty</p>
              <AutosizeTextarea
                value={form.warranty}
                onChange={(e) => setForm((f) => ({ ...f, warranty: e.target.value }))}
                placeholder="e.g. 2-year manufacturer warranty"
                minRows={3}
                className="border-0 px-0 font-medium focus-visible:ring-0 shadow-none"
              />
            </div>

            {receipt?.products && receipt.products.length > 0 && (
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</p>
                  <p className="text-xs text-muted-foreground">
                    {receipt.products.reduce((sum, p) => sum + (p.quantity && p.quantity > 1 ? p.quantity : 1), 0)} items total
                  </p>
                </div>
                <ul className="space-y-2">
                  {receipt.products.map((p, i) => (
                    <li key={i} className="flex justify-between text-sm">
                      <span>
                        {p.quantity && p.quantity > 1 ? `×${p.quantity} ` : ""}{p.name}
                      </span>
                      {p.price != null && (
                        <span className="font-mono">{currencySymbol(receipt.currency)}{p.price.toFixed(2)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {receipt?.notableItems && receipt.notableItems.length > 0 && (
            <NotableItemsBanner items={receipt.notableItems} currency={receipt.currency} />
          )}

          <div className="mt-auto space-y-3 pt-4">
            <Button
              className="w-full rounded-full h-12 text-base font-semibold"
              onClick={handleSave}
              disabled={updateReceipt.isPending}
            >
              {updateReceipt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Purchase
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full h-12 text-base"
              onClick={handleRetake}
              disabled={deleteReceipt.isPending}
            >
              Retake
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
