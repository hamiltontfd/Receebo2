---
name: Marketing media review
description: Human review policy and isolated capture runtime environment.
---

Marketing media freshness tracks approved source inputs, not deterministic video
bytes. Fresh recording bytes can differ even when the UI is unchanged. Do not
silently approve the initial baseline or refresh published exports during checks.

**Why:** Capture success only proves interactions and isolation; it cannot prove
that the media visually represents the current product. Public exports need
explicit human review and a new version instead of overwriting a cached release.

**How to apply:** Keep capture/check work separate from upload and human approval.
When stripping service credentials from capture child environments, preserve
runtime/cache locations, including XDG_CACHE_HOME: Playwright's installed ffmpeg
otherwise resolves to a different cache and recording fails despite installation.
