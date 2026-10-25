---
name: Independent PWA offline startup
description: Why offline navigation must not depend on connectivity flags or remote authentication startup.
---

Offline startup must remain independent of authentication providers and advisory
browser connectivity flags.

**Why:** A production-worker browser test showed `navigator.onLine` false before
an offline reload and true afterward. A cached React shell alone consequently
rendered the normal authentication-dependent app rather than the intended offline
message. More generally, connected Wi-Fi does not prove the internet is reachable.

**How to apply:** Preserve a self-contained, private-data-free offline document
selected on actual navigation failure, not only on `navigator.onLine`. Check this
with the production worker, not a Vite development worker or source inspection.
Live network-loss messaging must not unmount an active page and lose its drafts.
