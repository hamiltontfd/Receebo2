---
name: PWA development worker fallback
description: Why the Receebo injectManifest service worker must not install its app-shell navigation fallback in development.
---

With `vite-plugin-pwa` in `injectManifest` mode, the development worker receives an empty precache manifest. Do not call `createHandlerBoundToURL("index.html")` in development; install that navigation route only for production builds.

**Why:** Workbox throws while evaluating the development worker if the handler targets an entry that was not precached. Registration then fails, and notification settings can remain unavailable even though the worker URL itself serves JavaScript.

**How to apply:** Keep push and notification-click listeners active in both modes, but guard the app-shell `NavigationRoute` with the production build flag. Verify registration in a real browser after changing service-worker startup code.