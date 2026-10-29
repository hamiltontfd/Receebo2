---
name: Brand icons
description: User requirements for Receebo browser and installed-app icons.
---
Every logo in the product uses the current Receebo mark from `artifacts/receiptr/public/logo.svg` (the header/landing logo), without the wordmark. Regenerate everything with `node artifacts/receiptr/scripts/generate-icons.mjs`.

- Favicon (`favicon.svg`, `favicon.ico`, `icons/favicon-32.png`) and `logo-mark.svg`: cropped to the black rounded outline, no white margin, transparent outside the rounded corners (Hamilton, 29 Oct 2026: "o logo deve ser padronizado em todos os cantos", plus his earlier favicon-crop request).
- Installed-app icons (manifest, Apple touch icon, Expo app icon): the mark on a white background, with padding; the maskable icon keeps the mark inside the central safe circle.
- Android push badge (`icons/badge-96.png`): white silhouette of the mark on transparent.

**Why:** The user asked for consistent original-symbol icons everywhere after seeing differently drawn icons (old filled push icon, old Receiptr mobile icon).

**How to apply:** Preserve the original vector geometry when regenerating icons; never redraw the symbol by hand.
