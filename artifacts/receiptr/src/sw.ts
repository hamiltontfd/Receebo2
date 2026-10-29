/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { isAppNavigation } from "./lib/navigationRoutes";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>;
};

if (import.meta.env.PROD) {
  registerRoute(
    ({ request, url }) =>
      request.mode === "navigate" &&
      url.origin === self.location.origin &&
      isAppNavigation(url.pathname, new URL(self.registration.scope).pathname),
    async ({ request }) => {
      // Network-only navigation keeps online HTML fresh. On network failure,
      // use a self-contained precached page that needs no Clerk/CDN scripts.
      // navigator.onLine alone is not reliable (Wi-Fi can have no internet).
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch(request, { cache: "no-store", signal: controller.signal });
        if (response.status < 500) return response;
      } catch {
        // No requests or mutations are queued; only static assets are cached.
      } finally {
        clearTimeout(timeout);
      }
      return (await matchPrecache("offline.html")) ?? Response.error();
    },
  );
}
// Register navigations first: Workbox's precache directoryIndex otherwise
// matches "/" before the network/offline handler and bypasses offline startup.
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

// Never replace a running version automatically. Refuse activation with other
// open windows: another tab may be capturing/uploading or have unsaved edits.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "APPLY_UPDATE") return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sourceId = event.source && "id" in event.source ? event.source.id : null;
    if (windows.length !== 1 || windows[0].id !== sourceId) {
      event.ports[0]?.postMessage({ accepted: false });
      return;
    }
    event.ports[0]?.postMessage({ accepted: true });
    await self.skipWaiting();
  })());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json() as {
    title?: string;
    body?: string;
    receiptId?: number;
  };
  event.waitUntil(
    self.registration.showNotification(payload.title || "Receebo", {
      body: payload.body,
      icon: `${self.registration.scope}icons/receebo-white-192.png`,
      // Android tints the badge itself; it must be a white-on-transparent silhouette.
      badge: `${self.registration.scope}icons/badge-96.png`,
      tag: payload.receiptId ? `return-window-${payload.receiptId}` : "receebo-reminder",
      data: { receiptId: payload.receiptId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const receiptId = event.notification.data?.receiptId;
  const targetUrl = receiptId
    ? `${self.registration.scope}receipts/${receiptId}`
    : self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        void existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});