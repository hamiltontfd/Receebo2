import { useState, useEffect, useCallback } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

interface ReceiptPreviewProps {
  fileUrl: string;
  fileName: string;
}

/**
 * Compact "Original receipt" row: file icon, title, file name and an "Open"
 * link. There is deliberately no inline preview (PDF iframe / image) — at
 * card size it was unreadable and took a lot of space; "Open" shows the file
 * full-size in a new tab instead.
 *
 * The file is fetched as an authenticated blob up front so the click can call
 * window.open synchronously (keeps mobile popup blockers happy).
 */
export function ReceiptPreview({ fileUrl, fileName }: ReceiptPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setBlobUrl(null);

    customFetch<Blob>(fileUrl, { responseType: "blob", cache: "no-store" })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        // Leave "Open" disabled; nothing else to show.
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
    <div className="rounded-2xl border p-4 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-sm">Original receipt</p>
          <p className="text-xs text-muted-foreground truncate">{fileName}</p>
        </div>
      </div>

      <button
        type="button"
        className="shrink-0 ml-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-40"
        onClick={handleOpen}
        disabled={!blobUrl}
        aria-label="Open original receipt in new tab"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Open
      </button>
    </div>
  );
}
