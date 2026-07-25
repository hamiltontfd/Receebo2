import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open original receipt in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </a>
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
              {!imageLoaded && !imageError && (
                <Skeleton className="w-full h-64 rounded-none" />
              )}
              {!imageError && (
                <img
                  src={fileUrl}
                  alt={fileName}
                  className={`w-full object-contain max-h-[60vh] transition-opacity duration-200 ${
                    imageLoaded ? "opacity-100" : "opacity-0 h-0"
                  }`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              )}
              {imageError && <PreviewError />}
            </>
          )}

          {isPdf && (
            <div className="h-[60vh]">
              <iframe
                src={fileUrl}
                title={fileName}
                className="w-full h-full border-0"
                loading="lazy"
              />
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
