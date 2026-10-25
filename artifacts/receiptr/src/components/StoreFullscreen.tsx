import { useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

interface StoreFullscreenProps {
  fileUrl: string;
  onClose: () => void;
}

export function StoreFullscreen({ fileUrl, onClose }: StoreFullscreenProps) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        if ("wakeLock" in navigator) {
          navigator.wakeLock.request("screen").catch(() => {});
        }
      } catch {}
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-pointer"
      onClick={onClose}
      role="button"
      aria-label="Dismiss full-screen receipt view"
    >
      <motion.img
        src={fileUrl}
        alt="Receipt"
        className="max-w-full max-h-full object-contain select-none"
        draggable={false}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      />
      <button
        style={{ top: "max(1rem, env(safe-area-inset-top))", right: "max(1rem, env(safe-area-inset-right))" }}
        className="absolute w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-xs select-none">
        Tap anywhere to dismiss
      </p>
    </motion.div>
  );
}
