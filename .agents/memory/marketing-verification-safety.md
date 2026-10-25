---
name: Marketing verification safety
description: Avoid integration side effects when checking public landing-page assets.
---

Do not start the ordinary API entry point solely to verify public marketing
media in a workspace with live connections.

**Why:** API startup performs migrations, Stripe webhook registration/backfill,
Gmail scheduling and cleanup even when the browser only visits the signed-out
landing page. This was observed during marketing verification; a read-only
browser test does not make the server's startup read-only.

**How to apply:** Use an already-safe development API or a verification process
that loads the normal Express app and its auth/storage middleware without the
startup entry point and its jobs. Do not bypass auth or access private data.
