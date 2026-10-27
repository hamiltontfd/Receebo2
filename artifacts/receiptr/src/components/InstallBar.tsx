import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/react";
import { X } from "lucide-react";
import { getGetRecentReceiptsQueryKey, useGetRecentReceipts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  clearInstallEvent, getInstallEvent, hasPwaWork, isInstalled, startInstallCapture,
  subscribeInstall, subscribePwaWork, wasAppInstalled,
} from "@/lib/pwa";
import {
  INSTALL_COPY, installPlatform, isMobileDevice, readDismissedAt, saveDismissedAt, shouldShowInstallBar,
} from "@/lib/installPrompt";
import { getAppLocale } from "@/lib/locale";

/** iOS Share glyph (square with an up arrow), drawn inline. */
function ShareIcon() {
  return (
    <svg aria-label="Share" role="img" viewBox="0 0 24 24" className="inline-block w-4 h-4 align-[-2px] mx-0.5"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

function Step({ text }: { text: string }) {
  const [before, after] = text.split("{share}");
  return <>{before}{after !== undefined && <><ShareIcon />{after}</>}</>;
}

export default function InstallBar() {
  useEffect(() => { startInstallCapture(); }, []);
  const { isSignedIn } = useAuth();
  const installEvent = useSyncExternalStore(subscribeInstall, getInstallEvent);
  const installedNow = useSyncExternalStore(subscribeInstall, wasAppInstalled);
  const busy = useSyncExternalStore(subscribePwaWork, hasPwaWork);
  const [standalone, setStandalone] = useState(isInstalled);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [dismissedAt, setDismissedAt] = useState(() => readDismissedAt());
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: recent } = useGetRecentReceipts({ limit: 1 }, {
    query: { queryKey: getGetRecentReceiptsQueryKey({ limit: 1 }), enabled: Boolean(isSignedIn) },
  });
  const copy = INSTALL_COPY[getAppLocale()];
  const platform = installPlatform();

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const onDisplay = () => setStandalone(isInstalled());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    display.addEventListener?.("change", onDisplay);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      display.removeEventListener?.("change", onDisplay);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const visible = online && !busy && !installedNow && shouldShowInstallBar({
    signedIn: Boolean(isSignedIn),
    receiptCount: Array.isArray(recent) ? recent.length : 0,
    standalone,
    dismissedAt,
    now: Date.now(),
    canInstall: Boolean(installEvent) || isMobileDevice(),
  });

  // Lets fixed bottom UI (the scan button) sit above the bar.
  useEffect(() => {
    if (!visible) return;
    document.documentElement.style.setProperty("--install-bar-h", "3.5rem");
    return () => { document.documentElement.style.removeProperty("--install-bar-h"); };
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    const now = Date.now();
    saveDismissedAt(now);
    setDismissedAt(now);
    setSheetOpen(false);
  };
  const install = async () => {
    const event = getInstallEvent();
    if (!event) { setSheetOpen(true); return; }
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "dismissed") dismiss();
    } catch {
      setSheetOpen(true);
    } finally {
      clearInstallEvent();
    }
  };

  return (
    <>
      <div aria-hidden className="h-14 shrink-0" />
      <div role="region" aria-label={copy.title} data-testid="install-bar"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-3">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="h-8 w-8 shrink-0 rounded-lg" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{copy.bar}</p>
          <Button size="sm" className="rounded-full" onClick={() => void install()}>{copy.install}</Button>
          <button type="button" aria-label={copy.dismiss} onClick={dismiss}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="text-base">{copy.title}</SheetTitle>
          <SheetDescription className="sr-only">{copy.bar}</SheetDescription>
          <ol className="mt-3 space-y-3 text-sm">
            {copy.steps[platform].map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{index + 1}</span>
                <span className="pt-0.5"><Step text={step} /></span>
              </li>
            ))}
          </ol>
          <SheetClose asChild>
            <Button variant="secondary" className="mt-5 w-full rounded-full">{copy.close}</Button>
          </SheetClose>
        </SheetContent>
      </Sheet>
    </>
  );
}
