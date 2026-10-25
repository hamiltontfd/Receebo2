---
name: OAuth validation across workspace forks
description: Avoid confusing the connected browser's main-project preview with an assigned workspace's OAuth origin.
---

Match browser-assisted OAuth validation to the assigned workspace, not whichever preview is already open in the connected browser.

**Why:** An isolated task workspace can use a different development hostname from the main project shown in the browser. Reusing that browser's existing preview can test a different server and register the wrong callback, even when both show the same application.

**How to apply:** Confirm the callback emitted by the authenticated running app, authorize that exact development origin and callback on the existing OAuth client, and preserve production entries. Keep authorization query strings, credentials, and browser session access URLs out of inspection output.
