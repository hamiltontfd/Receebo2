---
name: Expo dependency watcher
description: Metro startup failures following workspace dependency installation.
---

After changing workspace dependencies, verify the mobile workflow even when the feature only touches the web app.

**Why:** Metro can watch a transient pnpm extraction directory that disappears during installation, then crash with ENOENT despite unchanged mobile source.

**How to apply:** Finish dependency installation before restarting the existing mobile workflow. Check Expo dependency compatibility, startup logs and native bundle generation; do not treat a vanished temporary dependency folder as an application-code defect.
