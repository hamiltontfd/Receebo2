---
name: PWA development worker fallback
description: Why Receebo precache-dependent navigation fallbacks must remain production-only.
---

With `vite-plugin-pwa` in `injectManifest` mode, the development worker receives an empty precache manifest. Keep precache-dependent navigation fallbacks production-only.

**Why:** An earlier app-shell handler made Workbox throw during development worker evaluation because its target was not precached. Registration failed, making notification settings unavailable even though the worker URL served JavaScript. The current static offline target also only exists in the production precache.

**How to apply:** Keep push and notification-click listeners active in both modes, but guard navigation fallbacks with the production build flag. Verify registration in a browser after changing service-worker startup code.