---
name: Language preference boundaries
description: Why language selection is deliberately separate from market and visitor adoption.
---

Web/PWA language selection has deliberately incremental translation coverage, not
a promise that every screen, email, legal document or native screen is translated.
Preserve the visible disclosure when expanding coverage.

**Why:** This feature establishes a real account preference without representing
existing English-only flows or legal scaffolding as translated or approved.

**How to apply:** Extend translations explicitly by surface. Never use the selected
language to rewrite purchase country, currency or legal jurisdiction.

Visitors always use browser language. Do not display a manual language selector on the homepage, including on mobile. Manual language changes belong only in signed-in user settings.

**Why:** The user explicitly requested automatic browser language on the public site and manual changes only in account settings after login.

**How to apply:** Ignore legacy visitor language overrides in browser storage. Keep account values out of browser-wide preference storage and restore browser language on logout. Account automatic mode also means browser language, not a previous visitor's saved language. Language remains independent of market.
