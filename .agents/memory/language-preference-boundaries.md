---
name: Language preference boundaries
description: Why language selection is deliberately separate from market and visitor adoption.
---

Web/PWA language selection is not a promise that original purchase data, external
authentication content, legal documents, recordings or native screens are translated.
Keep the visible disclosure specific to untranslated content when expanding coverage.

**Why:** The account preference must not represent third-party content or legal
scaffolding as translated or approved. Original merchant/item/extracted text is
purchase data, not interface copy to rewrite.

**How to apply:** Extend translations explicitly by surface. Never use the selected
language to rewrite purchase country, currency or legal jurisdiction.

Visitors always use browser language. Do not display a manual language selector on the homepage, including on mobile. Manual language changes belong only in signed-in user settings.

The authenticated app home must not show the compact country/market selector either; keep that preference in account settings alongside language.

**Why:** The user reiterated that selection belongs in settings when showing the “PT / UE” control on the signed-in home.

**How to apply:** Treat the screenshot as identifying the unwanted control even though it is a market selector, not a language selector. Preserve the distinction between both preferences.

**Why:** The user explicitly requested automatic browser language on the public site and manual changes only in account settings after login.

**How to apply:** Ignore legacy visitor language overrides in browser storage. Keep account values out of browser-wide preference storage and restore browser language on logout. Account automatic mode also means browser language, not a previous visitor's saved language. Language remains independent of market.

For account emails, automatic means English, not the last browser language.
Explicit account choices apply to application-owned mail only; provider-owned
authentication/billing messages remain separate.

**Why:** Scheduled jobs and webhooks have no browser, and market or receipt
country must not silently become a language preference. The email language must
also survive account deletion long enough to send the final confirmation.

**How to apply:** Resolve the current saved language per send, fail on read errors,
and capture it with the contact before deleting the account. Do not cache or
persist an inferred browser language for automatic email sends.
Callers that reserve a notification before sending must undo that reservation
on thrown lookup errors as well as unsuccessful delivery. A reservation is not
proof that a required deletion warning reached the provider.


## Superseded 2 Nov 2026 (Hamilton)
The browser's resolved language IS now persisted, in a separate column
(`user_preferences.detected_language` + `detected_language_at`), only for signed-in
accounts after legal consent, never over the manual `language`, and only for emails
(manual > detected > English). The interface still follows the browser live.
