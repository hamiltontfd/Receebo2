import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { AlertTriangle, Camera, Upload, Check, Loader2, X, ScrollText, Square, ChevronDown, Zap, ZapOff } from "lucide-react";
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
  checkSimilarReceipt,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetReceiptStatsQueryKey,
  getGetRecentReceiptsQueryKey,
  customFetch,
  type SimilarReceiptMatch,
} from "@workspace/api-client-react";
import { NotableItemsBanner } from "@/components/NotableItemsBanner";
import { currencySymbol } from "@/lib/currency";
import { compressImage, compressedFileName } from "@/lib/compressImage";
import { CATEGORIES, categoryStyle } from "@/lib/categories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePwaUpdateBlocker } from "@/lib/pwa";
import {
  useBillingStatus,
  useRefreshBilling,
  uploadBlockedReason,
  quotaErrorMessage,
  resolveAccessState,
  TRIAL_UPLOAD_LIMIT,
  isAtTrialCap,
  type BillingStatus,
} from "@/hooks/useBilling";
import { ACTIVE_REVIEW_KEY } from "@/components/PlanSelectionGate";
import { subscribeToastAction } from "@/components/SubscribeToastAction";
import { TRIAL_CAP_BUTTON, isTrialLimitMessage } from "@/lib/trialCopy";
import { getLastTab, hasPendingUpload, takePendingUpload } from "@/lib/navState";

function setActiveReview(id: number | null) {
  try {
    if (id == null) sessionStorage.removeItem(ACTIVE_REVIEW_KEY);
    else sessionStorage.setItem(ACTIVE_REVIEW_KEY, String(id));
  } catch {
    /* storage unavailable */
  }
}

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
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

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
        // Flash only where the browser exposes a torch (most Android Chrome; not iOS Safari).
        try {
          const track = stream.getVideoTracks?.()[0];
          const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
          setTorchSupported(caps?.torch === true);
        } catch {
          setTorchSupported(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCameraError(true);
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraReady(false);
      setTorchSupported(false);
      setTorchOn(false);
    };
  }, [enabled]);

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false));
  }, [torchOn]);

  return { videoRef, cameraReady, cameraError, torchSupported, torchOn, toggleTorch };
}

export default function Scan() {
  // Conservative: capture permission, image conversion, stitching, extraction,
  // retake drafts and review all belong to this session. Leave Scan to update.
  usePwaUpdateBlocker(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("capture");
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [stepsDone, setStepsDone] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const billingQuery = useBillingStatus();
  const billing = billingQuery.data;
  const refreshBilling = useRefreshBilling();
  const blockedReason = billing ? uploadBlockedReason(billing) : null;
  const trialUploadsLeft =
    billing && resolveAccessState(billing) === "account_trial"
      ? billing.trialUploadsRemaining ?? null
      : null;

  useEffect(() => () => setActiveReview(null), []);

  /** Synchronous preflight using the polled status (keeps user activation for pickers). */
  const preflightUpload = (): boolean => {
    const reason = billing ? uploadBlockedReason(billing) : "We couldn't confirm your plan. Check your connection and try again.";
    if (reason) {
      toast({ title: "Upload not available", description: reason, variant: "destructive",
        ...(isTrialLimitMessage(reason) ? { action: subscribeToastAction(setLocation) } : {}) });
      void billingQuery.refetch();
      return false;
    }
    return true;
  };
  const openFilePicker = () => {
    if (preflightUpload()) fileInputRef.current?.click();
  };

  // On desktop, upload is the primary path; the camera is opt-in.
  const [isDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );
  const [cameraRequested, setCameraRequested] = useState(false);
  // A file chosen in the Add sheet's "Upload file" is handed over here; while it
  // uploads, the camera stays off.
  const [handoffActive, setHandoffActive] = useState(() => hasPendingUpload());
  const cameraActive = phase === "capture" && !blockedReason && !handoffActive && (!isDesktop || cameraRequested);
  // Phones get the full-screen camera (nav B); desktop keeps the in-page Scan.
  const fullScreenCamera = phase === "capture" && !blockedReason && !handoffActive && !isDesktop;

  const { videoRef, cameraReady, cameraError, torchSupported, torchOn, toggleTorch } = useCameraStream(cameraActive);

  const [checkConfirmed, setCheckConfirmed] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<SimilarReceiptMatch[] | null>(null);
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);
  const [dismissedIncomplete, setDismissedIncomplete] = useState(false);

  // Saved draft from a warning-card retake so edits survive re-scan
  const savedFormDraftRef = useRef<{ merchant: string; purchaseDate: string; total: string; category: string; warranty: string } | null>(null);

  // Panoramic mode
  const PAN_MAX_FRAMES = 12;
  const PAN_INTERVAL_MS = 800;
  const [panoramicMode, setPanoramicMode] = useState(false);
  const [panCapturing, setPanCapturing] = useState(false);
  const [panFrameCount, setPanFrameCount] = useState(0);
  const [panStitchedBlob, setPanStitchedBlob] = useState<Blob | null>(null);
  const [panStitchedUrl, setPanStitchedUrl] = useState<string | null>(null);
  const panFramesRef = useRef<Blob[]>([]);
  const panIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup object URL on unmount / reset
  const clearPanState = useCallback(() => {
    if (panIntervalRef.current) {
      clearInterval(panIntervalRef.current);
      panIntervalRef.current = null;
    }
    setPanCapturing(false);
    setPanFrameCount(0);
    panFramesRef.current = [];
    setPanStitchedBlob(null);
    setPanStitchedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const stitchFrames = useCallback(async (frames: Blob[]): Promise<Blob | null> => {
    if (frames.length === 0) return null;
    try {
      const bitmaps = await Promise.all(frames.map((f) => createImageBitmap(f)));
      const frameW = bitmaps[0].width;
      const frameH = bitmaps[0].height;
      const canvas = document.createElement("canvas");
      canvas.width = frameW;
      canvas.height = frameH * bitmaps.length;
      const ctx = canvas.getContext("2d");
      if (!ctx) { bitmaps.forEach((b) => b.close()); return null; }
      bitmaps.forEach((bm, i) => {
        ctx.drawImage(bm, 0, i * frameH, frameW, frameH);
        bm.close();
      });
      return new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
      });
    } catch {
      return null;
    }
  }, []);

  const stopPanCapture = useCallback(async () => {
    if (panIntervalRef.current) {
      clearInterval(panIntervalRef.current);
      panIntervalRef.current = null;
    }
    setPanCapturing(false);
    const frames = [...panFramesRef.current];
    if (frames.length === 0) return;
    const blob = await stitchFrames(frames);
    if (blob) {
      setPanStitchedBlob(blob);
      setPanStitchedUrl(URL.createObjectURL(blob));
    }
  }, [stitchFrames]);

  const startPanCapture = useCallback(() => {
    clearPanState();
    setPanCapturing(true);
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        panFramesRef.current.push(blob);
        const count = panFramesRef.current.length;
        setPanFrameCount(count);
        if (count >= PAN_MAX_FRAMES) {
          // will be handled by the effect watching panCapturing + panFrameCount
        }
      }, "image/jpeg", 0.8);
    }, PAN_INTERVAL_MS);
    panIntervalRef.current = id;
  }, [clearPanState, videoRef]);

  // Auto-stop when max frames reached
  useEffect(() => {
    if (panCapturing && panFrameCount >= PAN_MAX_FRAMES) {
      stopPanCapture();
    }
  }, [panCapturing, panFrameCount, stopPanCapture]);

  // Reset panoramic state when leaving capture phase
  useEffect(() => {
    if (phase !== "capture") {
      clearPanState();
    }
  }, [phase, clearPanState]);

  const createReceipt = useCreateReceipt();
  const updateReceipt = useUpdateReceipt();
  const deleteReceipt = useDeleteReceipt();

  const { data: receipt } = useGetReceipt(receiptId ?? 0, {
    query: {
      enabled: receiptId != null && phase === "reading",
      queryKey: getGetReceiptQueryKey(receiptId ?? 0),
      refetchInterval: (query) =>
        query.state.data?.status === "processing" ? 1500 : false,
    },
  });

  // Animate reading steps while processing — only after the backend confirms
  // the image passed the pre-check (checkConfirmed=true). This prevents any
  // green tick from flashing when a non-receipt is rejected on the first poll.
  useEffect(() => {
    if (phase !== "reading") {
      setCheckConfirmed(false);
      return;
    }
    setStepsDone(0);
  }, [phase]);

  useEffect(() => {
    if (phase !== "reading" || !checkConfirmed) return;
    const interval = setInterval(() => {
      setStepsDone((n) => Math.min(n + 1, READING_STEPS.length - 1));
    }, 1200);
    return () => clearInterval(interval);
  }, [phase, checkConfirmed]);

  // Move to review (or not_a_receipt) when extraction finishes
  useEffect(() => {
    if (phase !== "reading" || !receipt) return undefined;
    if (receipt.status === "not_a_receipt") {
      setPhase("not_a_receipt");
      return undefined;
    }
    if (receipt.status === "processing") {
      setCheckConfirmed(true);
      return undefined;
    }
    if (receipt.status === "completed" || receipt.status === "failed") {
      setCheckConfirmed(true);
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
    setDismissedIncomplete(false);
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
      const fromScan = {
        merchant: receipt.merchant ?? "",
        purchaseDate: receipt.purchaseDate ?? "",
        total: receipt.total != null ? String(receipt.total) : "",
        category: receipt.category ?? "",
        warranty: receipt.warranty ?? "",
      };
      // If the user hit "Retake" from the warning card, merge their saved edits
      // back in — the new scan's data takes priority for any field it filled;
      // fields still empty after re-scan fall back to the user's manual values.
      if (savedFormDraftRef.current) {
        const draft = savedFormDraftRef.current;
        savedFormDraftRef.current = null;
        setForm({
          merchant: fromScan.merchant || draft.merchant,
          purchaseDate: fromScan.purchaseDate || draft.purchaseDate,
          total: fromScan.total || draft.total,
          category: fromScan.category || draft.category,
          warranty: fromScan.warranty || draft.warranty,
        });
      } else {
        setForm(fromScan);
      }
      setDismissedIncomplete(false);
    }
  }, [phase, receipt]);

  const uploadFile = useCallback(
    async (blob: Blob, fileName: string, contentType: string): Promise<boolean> => {
      if (!navigator.onLine) {
        toast({ title: "Connection required", description: "Connect before uploading a receipt. Nothing was uploaded.", variant: "destructive" });
        return false;
      }
      setUploading(true);
      let reservedPath: string | undefined;
      try {
        // Fresh server check right before uploading, so quota used on another
        // device is respected. Fails closed if the status can't be fetched.
        const fresh = await billingQuery.refetch();
        const latest = fresh.data as BillingStatus | undefined;
        const reason = fresh.isError || !latest
          ? "We couldn't confirm your plan. Check your connection and try again. Nothing was uploaded."
          : uploadBlockedReason(latest);
        if (reason) {
          toast({ title: "Upload not available", description: reason, variant: "destructive",
            ...(isTrialLimitMessage(reason) ? { action: subscribeToastAction(setLocation) } : {}) });
          return false;
        }
        const { uploadURL, objectPath } = await customFetch<{
          uploadURL: string;
          objectPath: string;
        }>(`${import.meta.env.BASE_URL}api/storage/uploads/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fileName, size: blob.size, contentType }),
        });
        reservedPath = objectPath;

        const put = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        });
        if (!put.ok) throw new Error("Upload failed");

        const created = await createReceipt.mutateAsync({
          data: { objectPath, originalFileName: fileName, contentType },
        });
        setReceiptId(created.id);
        setActiveReview(created.id);
        setPhase("reading");
        void refreshBilling();
        return true;
      } catch (err) {
        if (reservedPath) {
          try {
            await customFetch(`${import.meta.env.BASE_URL}api/storage/uploads/release`, {
              method: "POST", body: JSON.stringify({ objectPath: reservedPath }),
            });
          } catch {
            // An offline/abandoned reservation expires automatically server-side.
          }
          void refreshBilling();
        }
        const quota = quotaErrorMessage(err);
        if (quota) {
          void refreshBilling();
          toast({ title: "Upload limit reached", description: quota, variant: "destructive",
            ...(isTrialLimitMessage(quota) ? { action: subscribeToastAction(setLocation) } : {}) });
          return false;
        }
        toast({
          title: "Upload failed",
          description: "Could not upload the receipt. Please try again.",
          variant: "destructive",
        });
        return false;
      } finally {
        setUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createReceipt, toast, billingQuery.refetch],
  );

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const MAX_DIM = 2000;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      if (w >= h) { h = Math.round((h / w) * MAX_DIM); w = MAX_DIM; }
      else { w = Math.round((w / h) * MAX_DIM); h = MAX_DIM; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (blob) uploadFile(blob, `scan-${Date.now()}.jpg`, "image/jpeg");
      },
      "image/jpeg",
      0.85,
    );
  }, [uploadFile, videoRef]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const rawType = file.type || "application/octet-stream";
      const { blob, contentType } = await compressImage(file, rawType);
      const fileName = compressedFileName(file.name, contentType);
      uploadFile(blob, fileName, contentType);
    }
    e.target.value = "";
  };

  // Add sheet → Upload file: run the handed-over file through the same upload.
  // On failure (toast already shown) go back to the tab the user came from.
  useEffect(() => {
    const file = takePendingUpload();
    if (!file) return;
    void (async () => {
      const rawType = file.type || "application/octet-stream";
      const { blob, contentType } = await compressImage(file, rawType);
      const ok = await uploadFile(blob, compressedFileName(file.name, contentType), contentType);
      setHandoffActive(false);
      if (!ok) setLocation(getLastTab());
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeCamera = () => {
    clearPanState();
    setLocation(getLastTab());
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
      setActiveReview(null);
      void refreshBilling();
      setLocation(`/receipts/${receiptId}`);
    } catch (err) {
      // A receipt counts toward the trial when saved, so the cap can apply here.
      const quota = quotaErrorMessage(err);
      if (quota) void refreshBilling();
      toast({
        title: quota ? "Upload limit reached" : "Error",
        description: quota ?? "Failed to save the purchase.",
        variant: "destructive",
        ...(isTrialLimitMessage(quota) ? { action: subscribeToastAction(setLocation) } : {}),
      });
    }
  };

  const handleRetake = async () => {
    if (receiptId != null) {
      try {
        await deleteReceipt.mutateAsync({ id: receiptId });
        invalidateLists();
      } catch {
        toast({ title: "Could not remove receipt", description: "Check your connection and try again.", variant: "destructive" });
        return;
      }
    }
    setReceiptId(null);
    setActiveReview(null);
    void refreshBilling();
    setPhase("capture");
  };

  // Retake triggered from the incomplete warning card — saves the current form
  // draft so user edits survive re-scan (new scan data takes priority, saved
  // values fill any gaps the new scan still leaves empty).
  const handleWarningRetake = async () => {
    savedFormDraftRef.current = { ...form };
    await handleRetake();
  };

  const handleDiscard = async () => {
    if (receiptId != null) {
      try {
        await deleteReceipt.mutateAsync({ id: receiptId });
        invalidateLists();
      } catch {
        toast({ title: "Could not discard receipt", description: "Check your connection and try again. The receipt has not been discarded.", variant: "destructive" });
        return;
      }
    }
    setActiveReview(null);
    void refreshBilling();
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

      {phase === "capture" && blockedReason && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-12" data-testid="panel-upload-blocked">
          <span className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">No uploads left</h1>
          <p className="text-sm text-muted-foreground max-w-xs" data-testid="text-upload-blocked">{blockedReason}</p>
          <Link href="/settings#upgrade-plans" className="inline-flex h-11 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background" data-testid="link-scan-subscribe">
            {isAtTrialCap(billing) ? TRIAL_CAP_BUTTON : "See plans"}
          </Link>
        </div>
      )}

      {phase === "capture" && !blockedReason && handoffActive && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-12" data-testid="panel-handoff-upload">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Uploading your file…</p>
        </div>
      )}

      {fullScreenCamera && (
        <FullScreenCamera
          videoRef={videoRef}
          cameraReady={cameraReady}
          cameraError={cameraError}
          uploading={uploading}
          trialUploadsLeft={trialUploadsLeft}
          torchSupported={torchSupported}
          torchOn={torchOn}
          onToggleTorch={toggleTorch}
          onClose={closeCamera}
          onCapture={capturePhoto}
          onUploadInstead={openFilePicker}
          panoramicMode={panoramicMode}
          onMode={(long) => { clearPanState(); setPanoramicMode(long); }}
          panCapturing={panCapturing}
          panFrameCount={panFrameCount}
          panMaxFrames={PAN_MAX_FRAMES}
          onStartPan={startPanCapture}
          onStopPan={stopPanCapture}
          panStitchedUrl={panStitchedUrl}
          onUsePan={() => {
            if (panStitchedBlob) {
              uploadFile(panStitchedBlob, `scan-panoramic-${Date.now()}.jpg`, "image/jpeg");
              clearPanState();
            }
          }}
          canUsePan={!!panStitchedBlob}
          onRetakePan={clearPanState}
        />
      )}

      {phase === "capture" && !blockedReason && !handoffActive && isDesktop && (
        <div className="flex-1 flex flex-col gap-6">
          <div>
            <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Scan receipt</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Place the receipt inside the frame, or upload a file.
                </p>
                {trialUploadsLeft != null && (
                  <p className="text-xs font-semibold text-muted-foreground mt-2" data-testid="text-scan-trial-left">
                    {trialUploadsLeft} of {TRIAL_UPLOAD_LIMIT} free receipts left
                  </p>
                )}
              </div>
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
                onClick={openFilePicker}
                disabled={uploading}
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
                onClick={() => { if (preflightUpload()) setCameraRequested(true); }}
                disabled={uploading}
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
                  onClick={openFilePicker}
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload receipt
                </Button>
              </div>
            ) : panStitchedUrl ? (
              /* ── Panoramic preview ── */
              <div className="absolute inset-0 flex flex-col bg-black">
                <div className="flex-1 overflow-y-auto">
                  <img
                    src={panStitchedUrl}
                    alt="Stitched panoramic receipt"
                    className="w-full"
                  />
                </div>
                <div className="flex gap-3 p-4 bg-black/80">
                  <button
                    onClick={() => {
                      if (panStitchedBlob) {
                        uploadFile(panStitchedBlob, `scan-panoramic-${Date.now()}.jpg`, "image/jpeg");
                        clearPanState();
                      }
                    }}
                    disabled={uploading || !panStitchedBlob}
                    className="flex-1 h-12 rounded-full bg-white text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Use this
                  </button>
                  <button
                    onClick={clearPanState}
                    disabled={uploading}
                    className="flex-1 h-12 rounded-full border border-white/40 text-white font-semibold text-sm disabled:opacity-40"
                  >
                    Retake
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />

                {panoramicMode ? (
                  /* ── Panoramic capture UI ── */
                  <>
                    {/* Mode badge */}
                    <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                      <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                        <ScrollText className="w-3.5 h-3.5" />
                        Long receipt mode
                      </span>
                    </div>

                    {panCapturing ? (
                      /* Capturing: frame counter + animated arrow + stop button */
                      <>
                        <div className="absolute top-14 inset-x-0 flex flex-col items-center gap-2 pointer-events-none">
                          <span className="bg-black/70 text-white text-xs font-medium px-3 py-1 rounded-full">
                            {panFrameCount} / {PAN_MAX_FRAMES} frames
                          </span>
                          {/* Progress bar */}
                          <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
                            <div
                              className="h-full bg-white rounded-full transition-all duration-300"
                              style={{ width: `${(panFrameCount / PAN_MAX_FRAMES) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
                          <ChevronDown className="w-10 h-10 text-white/70 animate-bounce" />
                        </div>
                        <div className="absolute bottom-14 inset-x-0 flex items-center justify-center">
                          <button
                            aria-label="Stop panoramic capture"
                            onClick={stopPanCapture}
                            className="w-16 h-16 rounded-full border-4 border-red-400 bg-red-500/80 hover:bg-red-500 transition-colors flex items-center justify-center"
                          >
                            <Square className="w-6 h-6 text-white fill-white" />
                          </button>
                        </div>
                        <p className="absolute bottom-36 inset-x-0 text-center text-xs text-background/90">
                          Pan slowly downward — tap Stop when done
                        </p>
                      </>
                    ) : (
                      /* Ready to start: guide frame + start button */
                      <>
                        <div className="absolute inset-8 border-2 border-background/80 rounded-xl pointer-events-none" />
                        <p className="absolute bottom-36 inset-x-0 text-center text-xs text-background/90">
                          Tap Start, then pan the camera slowly downward
                        </p>
                        <div className="absolute bottom-14 inset-x-0 flex items-center justify-center gap-6">
                          <button
                            aria-label="Start panoramic capture"
                            onClick={startPanCapture}
                            disabled={!cameraReady || uploading}
                            className="px-8 h-14 rounded-full border-4 border-background bg-background/20 hover:bg-background/40 transition-colors disabled:opacity-40 text-background font-bold text-sm"
                          >
                            Start
                          </button>
                        </div>
                      </>
                    )}

                    {/* Toggle off button */}
                    {!panCapturing && (
                      <div className="absolute bottom-3 inset-x-0 flex justify-center">
                        <button
                          onClick={() => setPanoramicMode(false)}
                          className="text-background/60 text-xs underline"
                        >
                          Switch to single shot
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  /* ── Normal single-shot UI ── */
                  <>
                    {/* Framing guide */}
                    <div className="absolute inset-8 border-2 border-background/80 rounded-xl pointer-events-none" />
                    <p className="absolute bottom-36 inset-x-0 text-center text-xs text-background/90">
                      Place the receipt inside the frame
                    </p>
                    <div className="absolute bottom-14 inset-x-0 flex items-center justify-center gap-6">
                      <button
                        aria-label="Capture receipt"
                        onClick={capturePhoto}
                        disabled={!cameraReady || uploading}
                        className="w-16 h-16 rounded-full border-4 border-background bg-background/20 hover:bg-background/40 transition-colors disabled:opacity-40 flex items-center justify-center"
                      >
                        {uploading && <Loader2 className="w-6 h-6 text-background animate-spin" />}
                      </button>
                    </div>
                    {/* Long receipt toggle */}
                    <div className="absolute bottom-3 inset-x-0 flex justify-center">
                      <button
                        onClick={() => setPanoramicMode(true)}
                        disabled={!cameraReady || uploading}
                        className="flex items-center gap-1.5 text-background/70 text-xs disabled:opacity-40 hover:text-background/90 transition-colors"
                      >
                        <ScrollText className="w-3.5 h-3.5" />
                        Long receipt
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          )}

          {cameraRequested && !cameraError && (
            <Button
              variant="outline"
              className="rounded-full h-12"
              onClick={openFilePicker}
              disabled={uploading}
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
              Receebo is turning the image into a purchase.
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

          {(() => {
            const missingMerchant = !receipt?.merchant;
            const missingTotal = receipt?.total == null || receipt.total === 0;
            const isIncomplete = missingMerchant || missingTotal;
            if (!isIncomplete || dismissedIncomplete) return null;
            return (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Receipt looks incomplete
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {missingMerchant && missingTotal
                        ? "Merchant name and total amount are missing"
                        : missingMerchant
                          ? "Merchant name is missing"
                          : "Total amount is missing"} — the top or bottom of the receipt may have been cut off. This could cause problems with warranty claims or merchant returns.
                    </p>
                    <button
                      onClick={handleWarningRetake}
                      disabled={deleteReceipt.isPending}
                      className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:opacity-70 transition-opacity disabled:opacity-40"
                    >
                      Retake photo
                    </button>
                  </div>
                  <button
                    aria-label="Dismiss warning"
                    onClick={() => setDismissedIncomplete(true)}
                    className="flex-shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })()}

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

/**
 * Phone camera (nav B): full screen, edge to edge, no tab bar. X top-left
 * (back to the previous tab), flash top-right when the device has a torch,
 * shutter bottom centre with the PHOTO · LONG RECEIPT switch above it.
 * Long receipt is the existing panoramic capture. No upload control here:
 * upload lives in the Add sheet (the camera-unavailable fallback keeps one).
 */
function FullScreenCamera(props: {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  cameraError: boolean;
  uploading: boolean;
  trialUploadsLeft: number | null;
  torchSupported: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  onClose: () => void;
  onCapture: () => void;
  onUploadInstead: () => void;
  panoramicMode: boolean;
  onMode: (long: boolean) => void;
  panCapturing: boolean;
  panFrameCount: number;
  panMaxFrames: number;
  onStartPan: () => void;
  onStopPan: () => void;
  panStitchedUrl: string | null;
  onUsePan: () => void;
  canUsePan: boolean;
  onRetakePan: () => void;
}) {
  const {
    videoRef, cameraReady, cameraError, uploading, trialUploadsLeft, torchSupported, torchOn,
    onToggleTorch, onClose, onCapture, onUploadInstead, panoramicMode, onMode, panCapturing,
    panFrameCount, panMaxFrames, onStartPan, onStopPan, panStitchedUrl, onUsePan, canUsePan, onRetakePan,
  } = props;

  // Keep the active mode label centred over the shutter (Instagram-style).
  const photoRef = useRef<HTMLButtonElement | null>(null);
  const longRef = useRef<HTMLButtonElement | null>(null);
  const [modeShift, setModeShift] = useState(0);
  useLayoutEffect(() => {
    const el = panoramicMode ? longRef.current : photoRef.current;
    if (el) setModeShift(-(el.offsetLeft + el.offsetWidth / 2));
  }, [panoramicMode]);

  const safeTop = "env(safe-area-inset-top, 0px)";
  const safeBottom = "env(safe-area-inset-bottom, 0px)";
  const roundBtn = "absolute w-10 h-10 rounded-full bg-black/30 backdrop-blur-md text-white flex items-center justify-center z-10";

  const closeButton = (
    <button type="button" aria-label="Close camera" onClick={onClose} className={roundBtn} style={{ top: `calc(${safeTop} + 12px)`, left: 16 }} data-testid="button-camera-close">
      <X className="w-[22px] h-[22px]" strokeWidth={2.2} />
    </button>
  );

  if (panStitchedUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="fullscreen-camera">
        {closeButton}
        <div className="flex-1 overflow-y-auto" style={{ paddingTop: `calc(${safeTop} + 64px)` }}>
          <img src={panStitchedUrl} alt="Stitched panoramic receipt" className="w-full" />
        </div>
        <div className="flex gap-3 p-4 bg-black/80" style={{ paddingBottom: `calc(${safeBottom} + 16px)` }}>
          <button
            onClick={onUsePan}
            disabled={uploading || !canUsePan}
            className="flex-1 h-12 rounded-full bg-white text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Use this
          </button>
          <button
            onClick={onRetakePan}
            disabled={uploading}
            className="flex-1 h-12 rounded-full border border-white/40 text-white font-semibold text-sm disabled:opacity-40"
          >
            Retake
          </button>
        </div>
      </div>
    );
  }

  if (cameraError) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center gap-4 p-8 text-center" data-testid="fullscreen-camera">
        {closeButton}
        <Camera className="w-10 h-10 opacity-60" />
        <p className="text-sm opacity-80 max-w-xs">
          Camera is not available. Upload a photo or PDF of your receipt instead.
        </p>
        <Button variant="secondary" className="rounded-full" onClick={onUploadInstead} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />
          Upload receipt
        </Button>
      </div>
    );
  }

  const corner = "absolute w-[30px] h-[30px] border-white/90 pointer-events-none z-[3]";
  const cTop = `calc(${safeTop} + 76px)`;
  const cBottom = `calc(${safeBottom} + 150px)`;

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0c0b] overflow-hidden" data-testid="fullscreen-camera">
      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      {/* Soft vignette */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 85% 70% at 50% 45%, transparent 55%, rgba(0,0,0,.55))" }} />

      {closeButton}
      {torchSupported && (
        <button
          type="button"
          aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
          aria-pressed={torchOn}
          onClick={onToggleTorch}
          className={roundBtn}
          style={{ top: `calc(${safeTop} + 12px)`, right: 16 }}
          data-testid="button-camera-flash"
        >
          {torchOn ? <Zap className="w-5 h-5" strokeWidth={2} /> : <ZapOff className="w-5 h-5" strokeWidth={2} />}
        </button>
      )}

      {/* 4 corner guides instead of a full frame */}
      <div aria-hidden className={`${corner} border-t-[3px] border-l-[3px] rounded-tl-xl`} style={{ top: cTop, left: 36 }} />
      <div aria-hidden className={`${corner} border-t-[3px] border-r-[3px] rounded-tr-xl`} style={{ top: cTop, right: 36 }} />
      <div aria-hidden className={`${corner} border-b-[3px] border-l-[3px] rounded-bl-xl`} style={{ bottom: cBottom, left: 36 }} />
      <div aria-hidden className={`${corner} border-b-[3px] border-r-[3px] rounded-br-xl`} style={{ bottom: cBottom, right: 36 }} />

      {panoramicMode && panCapturing && (
        <>
          <div className="absolute inset-x-0 flex flex-col items-center gap-2 pointer-events-none z-[5]" style={{ top: `calc(${safeTop} + 64px)` }}>
            <span className="bg-black/70 text-white text-xs font-medium px-3 py-1 rounded-full">
              {panFrameCount} / {panMaxFrames} frames
            </span>
            <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${(panFrameCount / panMaxFrames) * 100}%` }} />
            </div>
          </div>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none z-[5]">
            <ChevronDown className="w-10 h-10 text-white/70 animate-bounce" />
          </div>
        </>
      )}

      {/* Bottom gradient, caption, mode switch, shutter */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[270px] pointer-events-none z-[4]" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,.55) 35%, rgba(0,0,0,.88))" }} />

      {(panoramicMode || trialUploadsLeft != null) && (
        <p className="absolute inset-x-0 text-center text-xs text-white/90 z-[5] px-6" style={{ bottom: `calc(${safeBottom} + 142px)` }}>
          {panoramicMode
            ? panCapturing ? "Pan slowly downward — tap Stop when done" : "Tap the shutter, then pan slowly downward"
            : <span data-testid="text-scan-trial-left">{trialUploadsLeft} of {TRIAL_UPLOAD_LIMIT} free receipts left</span>}
        </p>
      )}

      {!panCapturing && (
        <div
          className="absolute left-1/2 flex gap-[22px] whitespace-nowrap text-[13px] font-semibold tracking-[0.06em] uppercase z-[5] transition-[margin] duration-200"
          style={{ bottom: `calc(${safeBottom} + 116px)`, marginLeft: modeShift }}
          role="radiogroup"
          aria-label="Capture mode"
        >
          <button ref={photoRef} type="button" role="radio" aria-checked={!panoramicMode} onClick={() => onMode(false)}
            className={`uppercase ${panoramicMode ? "text-white/55" : "text-white"}`} disabled={uploading}>
            Photo
          </button>
          <button ref={longRef} type="button" role="radio" aria-checked={panoramicMode} onClick={() => onMode(true)}
            className={`uppercase ${panoramicMode ? "text-white" : "text-white/55"}`} disabled={uploading || !cameraReady}>
            Long receipt
          </button>
        </div>
      )}

      <div className="absolute left-1/2 -ml-[38px] z-[5]" style={{ bottom: `calc(${safeBottom} + 18px)` }}>
        {panoramicMode && panCapturing ? (
          <button
            type="button"
            aria-label="Stop panoramic capture"
            onClick={onStopPan}
            className="w-[76px] h-[76px] rounded-full border-4 border-red-400 bg-red-500/80 flex items-center justify-center"
          >
            <Square className="w-6 h-6 text-white fill-white" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={panoramicMode ? "Start panoramic capture" : "Take photo"}
            onClick={panoramicMode ? onStartPan : onCapture}
            disabled={!cameraReady || uploading}
            className="w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40"
            data-testid="button-shutter"
          >
            <span className={`w-[60px] h-[60px] rounded-full flex items-center justify-center ${panoramicMode ? "bg-white/90" : "bg-white"}`}>
              {uploading && <Loader2 className="w-6 h-6 text-black animate-spin" />}
              {!uploading && panoramicMode && <ScrollText className="w-6 h-6 text-black/70" />}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
