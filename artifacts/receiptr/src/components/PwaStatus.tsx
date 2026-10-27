import { useEffect, useState, useSyncExternalStore } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  getWaitingWorker, hasPwaWork, requestUpdate, subscribePwaWork, subscribeUpdate,
} from "@/lib/pwa";

// Install guidance lives in InstallBar (signed-in app only), not here.

export default function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [applying, setApplying] = useState(false);
  const [reloadReady, setReloadReady] = useState(false);
  const [message, setMessage] = useState("");
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const mutations = useIsMutating();
  const work = useSyncExternalStore(subscribePwaWork, hasPwaWork);
  const waiting = useSyncExternalStore(subscribeUpdate, getWaitingWorker);
  // Authentication and its callbacks should not be interrupted either.
  const blocked = work || mutations > 0 || /^\/sign-(in|up)/.test(location);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const applyUpdate = async () => {
    if (!waiting || blocked || !navigator.onLine || hasPwaWork() || queryClient.isMutating()) return;
    setApplying(true);
    setMessage("");
    const activationTimeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      setApplying(false);
      setMessage("The update is taking longer than expected. Try again, or reload when your work is finished.");
      setReloadReady(true);
    }, 20000);
    // Only this explicit action permits a reload; controller changes caused by
    // another tab (or a first install) never reload this window.
    const onController = () => {
      clearTimeout(activationTimeout);
      if (!hasPwaWork() && !queryClient.isMutating()) window.location.reload();
      else {
        setApplying(false);
        setReloadReady(true);
        setMessage("Update installed. Finish your work, then reload when ready.");
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController, { once: true });
    try {
      if (!(await requestUpdate(waiting))) {
        clearTimeout(activationTimeout);
        navigator.serviceWorker.removeEventListener("controllerchange", onController);
        setApplying(false);
        setMessage("Close other Receebo tabs or windows, then try again.");
      }
    } catch {
      clearTimeout(activationTimeout);
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      setApplying(false);
      setMessage("Could not apply the update. Please try again.");
    }
  };

  return (
    <aside aria-label="App status" className="pwa-status">
      {!online && (
        <p role="status" className="border-b bg-secondary px-4 py-3 text-sm">
          You’re offline. Receipts, uploads, edits, and AI processing need a connection.
          Changes are not queued or saved offline. Keep this page open to retain unsaved work.
        </p>
      )}
      {waiting && (
        <div role="status" className="border-b bg-secondary px-4 py-3 text-sm flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-0">A Receebo update is available.
            {blocked ? " Finish scanning, uploading, or editing before updating." : " Close other Receebo windows first."}
          </p>
          <Button size="sm" disabled={blocked || applying || !online} onClick={() => void applyUpdate()}>
            {applying ? "Updating…" : "Update now"}
          </Button>
        </div>
      )}
      {message && <p role="status" className="px-4 py-3 text-sm">{message}</p>}
      {reloadReady && <Button className="m-4" disabled={blocked || !online}
        onClick={() => { if (!hasPwaWork() && !queryClient.isMutating()) window.location.reload(); }}>
        Reload to finish update
      </Button>}
      {applying && <div role="status" aria-live="polite"
        className="fixed inset-0 z-[10000] bg-background/95 flex items-center justify-center p-6"
        onKeyDown={(event) => event.preventDefault()} tabIndex={0} ref={(element) => element?.focus()}>
        Applying update. Please keep Receebo open…
      </div>}
    </aside>
  );
}
