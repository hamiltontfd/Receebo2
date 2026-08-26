/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>;
};

precacheAndRoute(self.__WB_MANIFEST);
if (import.meta.env.PROD) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
}
clientsClaim();
self.skipWaiting();

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
      icon: `${self.registration.scope}icons/icon-192.png`,
      badge: `${self.registration.scope}icons/icon-192.png`,
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