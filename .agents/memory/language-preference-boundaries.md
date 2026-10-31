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

Visitor language is not automatically adopted by accounts, unlike visitor market.

**Why:** A shared browser's display language should not silently overwrite or
initialize another person's account preference. Account automatic mode means
browser language, not a previous visitor's saved language.

**How to apply:** Keep account values out of browser-wide preference storage and
restore the visitor's own preference on logout.
