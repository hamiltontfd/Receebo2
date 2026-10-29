import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Camera, ChartNoAxesColumn, ChevronRight, Plus, Search, Upload } from "lucide-react";
import { useBillingStatus, uploadBlockedReason } from "@/hooks/useBilling";
import { useToast } from "@/hooks/use-toast";
import { subscribeToastAction } from "@/components/SubscribeToastAction";
import { isTrialLimitMessage } from "@/lib/trialCopy";
import { setPendingUpload, tabForPath } from "@/lib/navState";

const INACTIVE = "#A3A3A3";
const ACTIVE = "#121212";

/**
 * Mobile bottom tab bar (nav B): Search · Add · Stats. Add is a centre action,
 * not a tab: it opens the Add sheet (Scan receipt / Upload file).
 */
export function BottomTabBar({ pendingDot }: { pendingDot: boolean }) {
  const [location] = useLocation();
  const active = tabForPath(location);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tabbar = "1";
    return () => { delete root.dataset.tabbar; };
  }, []);

  return (
    <>
      {/* In-flow spacer so page content never sits under the fixed bar. */}
      <div aria-hidden className="md:hidden shrink-0" style={{ height: "var(--tab-bar-h)" }} />
      <nav
        aria-label="Main"
        data-testid="bottom-tab-bar"
        className={`md:hidden fixed inset-x-0 bottom-0 bg-white border-t border-[#E6E6E6] flex px-2 pt-1.5 ${addOpen ? "z-[65]" : "z-40"}`}
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        {/* While the sheet is open the bar is dimmed like the page; only the X stays bright. */}
        {addOpen && (
          <div aria-hidden className="absolute inset-0 -top-px z-10 bg-[rgba(18,18,18,0.45)]" onClick={() => setAddOpen(false)} />
        )}
        <TabLink href="/search" label="Search" icon={Search} on={active === "/search"} dot={pendingDot && active !== "/search"} />
        <div className="flex-1 flex flex-col items-center justify-end gap-1 h-[46px] text-[11px] leading-[14px] font-medium" style={{ color: INACTIVE }}>
          <button
            type="button"
            aria-label={addOpen ? "Close add menu" : "Add receipt"}
            aria-expanded={addOpen}
            aria-haspopup="dialog"
            data-testid="tab-add"
            onClick={() => setAddOpen((v) => !v)}
            className="relative z-20 w-12 h-12 -mt-[26px] rounded-full bg-[#121212] text-white flex items-center justify-center shadow-[0_0_0_5px_#fff] active:scale-95 transition-transform"
          >
            <Plus
              className="w-6 h-6 transition-transform duration-200"
              strokeWidth={2.2}
              style={{ transform: addOpen ? "rotate(45deg)" : "none" }}
            />
          </button>
          <span className={addOpen ? "relative z-20 text-white font-semibold" : ""}>Add</span>
        </div>
        <TabLink href="/stats" label="Stats" icon={ChartNoAxesColumn} on={active === "/stats"} dot={false} />
      </nav>
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function TabLink({
  href, label, icon: Icon, on, dot,
}: { href: string; label: string; icon: typeof Search; on: boolean; dot: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      data-testid={`tab-${label.toLowerCase()}`}
      className="flex-1 flex flex-col items-center justify-end gap-1 h-[46px] text-[11px] leading-[14px]"
      style={{ color: on ? ACTIVE : INACTIVE, fontWeight: on ? 600 : 500 }}
    >
      <span className="relative">
        <Icon className="w-[22px] h-[22px]" strokeWidth={on ? 2 : 1.75} />
        {dot && (
          <span
            data-testid="search-pending-dot"
            aria-label="Purchases waiting in your email"
            className="absolute -top-px -right-[3px] w-2 h-2 rounded-full bg-[#121212] shadow-[0_0_0_2px_#fff]"
          />
        )}
      </span>
      {label}
    </Link>
  );
}

/**
 * The two manual ways to add a receipt. Upload keeps the native picker's
 * user activation: the file input is clicked synchronously, and the chosen
 * file is handed to /scan, which runs the existing upload and review flow.
 */
export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const billingQuery = useBillingStatus();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const scan = () => {
    onClose();
    setLocation("/scan");
  };

  const upload = () => {
    const billing = billingQuery.data;
    const reason = billing ? uploadBlockedReason(billing) : "We couldn't confirm your plan. Check your connection and try again.";
    if (reason) {
      toast({ title: "Upload not available", description: reason, variant: "destructive",
        ...(isTrialLimitMessage(reason) ? { action: subscribeToastAction(setLocation) } : {}) });
      void billingQuery.refetch?.();
      onClose();
      return;
    }
    fileRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    onClose();
    if (!file) return;
    setPendingUpload(file);
    setLocation("/scan");
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        data-testid="add-sheet-file-input"
        onChange={onFile}
      />
      {open && (
        <>
          <div
            aria-hidden
            data-testid="add-sheet-scrim"
            className="md:hidden fixed inset-0 z-[60] bg-[rgba(18,18,18,0.45)] animate-in fade-in duration-150"
            onClick={onClose}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add a receipt"
            data-testid="add-sheet"
            className="md:hidden fixed left-3 right-3 z-[70] bg-white rounded-3xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-2 duration-150"
            style={{ bottom: "calc(var(--tab-bar-h, 64px) + 20px)" }}
          >
            <AddRow icon={Camera} title="Scan receipt" sub="Use your camera" onClick={scan} testId="add-scan" />
            <div className="h-px bg-[#EFEFEF] mx-0" />
            <AddRow icon={Upload} title="Upload file" sub="Photo or PDF from your device" onClick={upload} testId="add-upload" />
          </div>
        </>
      )}
    </>
  );
}

function AddRow({
  icon: Icon, title, sub, onClick, testId,
}: { icon: typeof Camera; title: string; sub: string; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="w-full flex items-center gap-3.5 py-3.5 pl-3 pr-3.5 rounded-[18px] text-left hover:bg-[#FAFAFA] active:bg-[#F5F5F5]"
    >
      <span className="w-12 h-12 rounded-[14px] bg-[#F5F5F5] text-[#121212] flex items-center justify-center shrink-0">
        <Icon className="w-[22px] h-[22px]" strokeWidth={2} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold leading-[22px] tracking-[-0.01em] text-[#121212]">{title}</span>
        <span className="block text-[13px] leading-[18px] text-[#737373] mt-px">{sub}</span>
      </span>
      <ChevronRight className="w-[18px] h-[18px] text-[#C4C4C4] shrink-0" strokeWidth={2} />
    </button>
  );
}
