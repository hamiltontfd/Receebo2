---
name: Public hydration verification
description: Browser preference differences that must be tested when changing public prerendered content.
---

Verify public hydration with a narrow viewport, Portuguese browser language, and reduced motion, not just a default English desktop browser.

**Why:** A desktop/default-preference check missed a structural hydration mismatch: the browser's reduced-motion setting added a video control that the server snapshot did not contain. Valid generated HTML and successful HTTP checks did not catch this.

**How to apply:** Keep server and first hydration snapshots deterministic; apply media preferences after hydration. Test the production build with JavaScript enabled and disabled. Do not start API integration jobs just to serve these documents.
