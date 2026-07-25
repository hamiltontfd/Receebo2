import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch } from "@workspace/api-client-react";

interface ReceiptPreviewProps {
  fileUrl: string;
  contentType: string;
  fileName: string;
  defaultExpanded?: boolean;
}

export function ReceiptPreview({ fileUrl, contentType, fileName, defaultExpanded }: ReceiptPreviewProps) {
  const isImage = contentType.startsWith("image/");
  const isPdf = contentType === "application/pdf";

  const [isExpanded, setIsExpanded] = useState(
    () => defaultExpanded ?? (typeof window !== "undefined" ? window.innerWidth >= 768 : true),
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobError, setBlobError] = useState(false);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setBlobUrl(null);
    setBlobError(false);
    setImageLoaded(false);
    setImageError(false);

    customFetch<Blob>(fileUrl, { responseType: "blob" })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setBlobError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl]);

  const handleOpen = useCallback(() => {
    if (blobUrl) window.open(blobUrl, "_blank");
  }, [blobUrl]);

  return (
    <div className="rounded-2xl border overflow-hidden">
      <div
        className="p-4 flex items-center justify-between md:cursor-default cursor-pointer select-none"
        onClick={() => setIsExpanded((v) => !v)}
        role="button"
        aria-expanded={isExpanded}
        aria-label="Toggle receipt preview"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Original receipt</p>
            <p className="text-xs text-muted-foreground truncate">{fileName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-40"
            onClick={(e) => { e.stopPropagation(); handleOpen(); }}
            disabled={!blobUrl}
            aria-label="Open original receipt in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </button>
          <span className="md:hidden text-muted-foreground">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t bg-secondary/20">
          {isImage && (
            <>
              {!blobUrl && !blobError && (
                <Skeleton className="w-full h-64 rounded-none" />
              )}
              {blobUrl && !imageError && (
                <img
                  src={blobUrl}
                  alt={fileName}
                  className={`w-full object-contain max-h-[60vh] transition-opacity duration-200 ${
                    imageLoaded ? "opacity-100" : "opacity-0 h-0"
                  }`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              )}
              {(blobError || imageError) && <PreviewError />}
            </>
          )}

          {isPdf && (
            <div className="h-[60vh]">
              {blobUrl ? (
                <iframe
                  src={blobUrl}
                  title={fileName}
                  className="w-full h-full border-0"
                  loading="lazy"
                />
              ) : blobError ? (
                <PreviewError />
              ) : (
                <Skeleton className="w-full h-full rounded-none" />
              )}
            </div>
          )}

          {!isImage && !isPdf && (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Preview not available for this file type.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewError() {
  return (
    <div className="p-8 flex flex-col items-center gap-2 text-muted-foreground">
      <AlertTriangle className="w-6 h-6" />
      <p className="text-sm">Could not load preview</p>
    </div>
  );
}
