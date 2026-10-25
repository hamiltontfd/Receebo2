import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { marketingMedia } from "./MarketingMedia";

interface DemoVideo {
  title: string;
  clip: string;
  description: string;
}

export default function DemoVideoModal({
  demo, open, onOpenChange,
}: {
  demo: DemoVideo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();
  const [failedClip, setFailedClip] = useState<string | null>(null);

  const changeOpen = (next: boolean) => {
    if (!next) video.current?.pause();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {demo && (
        <DialogContent
          className={`w-[calc(100%-2rem)] max-w-4xl max-h-[calc(100dvh-2rem)] grid-cols-1 gap-0 overflow-y-auto rounded-2xl border-0 p-0 ${reduce ? "data-[state=open]:animate-none data-[state=closed]:animate-none" : ""}`}
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement | null; }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus({ preventScroll: true });
          }}
        >
          <div className="px-5 py-4 pr-12 border-b">
            <DialogTitle className="text-lg font-bold">{demo.title} — Receebo demo</DialogTitle>
          </div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
            className="min-w-0"
          >
            <video
              key={demo.clip}
              ref={video}
              controls
              controlsList="nofullscreen nodownload noremoteplayback"
              disablePictureInPicture
              disableRemotePlayback
              playsInline
              autoPlay
              muted
              preload="metadata"
              poster={marketingMedia(`${demo.clip}-poster.webp`)}
              width={960}
              height={640}
              aria-label={`${demo.title}: real Receebo screen recording using sample data`}
              className="block w-full aspect-[3/2] max-h-[65dvh] object-contain bg-black"
              onError={() => setFailedClip(demo.clip)}
              onLoadedData={() => setFailedClip(null)}
            >
              <source src={marketingMedia(`${demo.clip}.webm`)} type="video/webm" />
              <source src={marketingMedia(`${demo.clip}.mp4`)} type="video/mp4" />
              Your browser cannot play this clip. Read the demonstration description below.
            </video>
          </motion.div>
          <div className="px-5 py-4 space-y-2">
            {failedClip === demo.clip && (
              <p role="alert" className="text-sm text-destructive">
                This video couldn’t load. Check your connection and reopen the demo to retry.
              </p>
            )}
            <DialogDescription className="text-sm leading-relaxed">
              {demo.description}
            </DialogDescription>
            <p className="text-xs text-muted-foreground">
              Real Receebo screens. Fictional sample data and simulated extraction. Silent video.
            </p>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Close video</Button>
            </DialogClose>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
