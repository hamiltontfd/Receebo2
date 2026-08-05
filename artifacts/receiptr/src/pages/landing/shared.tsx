import { cn } from "@/lib/utils";
import { type Variants } from "framer-motion";
import { Image } from "lucide-react";

/* ── Animation Variants ──────────────────────────────────────────────── */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.55, ease: "easeOut" } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -36 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 36 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

export const staggerFast: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.02 } },
};

export const VIEWPORT = { once: true, margin: "-80px" as const };

/* ── Placeholder Box ─────────────────────────────────────────────────── */
interface PlaceholderProps {
  label: string;
  className?: string;
  icon?: React.ReactNode;
}

export function Placeholder({ label, className, icon }: PlaceholderProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 flex flex-col items-center justify-center gap-3 select-none",
        className,
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
        {icon ?? <Image className="w-5 h-5 text-muted-foreground/60" />}
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 text-center px-6 leading-relaxed">
        {label}
      </span>
    </div>
  );
}

/* ── Video Placeholder ───────────────────────────────────────────────── */
export function VideoPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full aspect-video rounded-xl border-2 border-dashed border-border/70 bg-muted/20 flex flex-col items-center justify-center gap-3 select-none",
        className,
      )}
    >
      {/* Play button circle */}
      <div className="w-12 h-12 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
        <div className="w-0 h-0 ml-1 border-t-[7px] border-t-transparent border-l-[12px] border-l-muted-foreground/40 border-b-[7px] border-b-transparent" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
        Video Placeholder
      </span>
    </div>
  );
}

/* ── Section Label ───────────────────────────────────────────────────── */
export function SectionLabel({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-widest mb-3",
        dark ? "text-white/50" : "text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}
