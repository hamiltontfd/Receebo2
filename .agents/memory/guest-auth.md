---
name: Guest-mode auth pitfalls
description: Rules for keeping guest mode (x-guest-id) and Clerk auth from cross-contaminating.
---

Rule 1: Any browser request to the API must go through the API client's `customFetch` (exported from `@workspace/api-client-react`), never a raw `fetch`. **Why:** customFetch attaches the `x-guest-id` header for guest sessions; a raw fetch silently loses it and guests get 401s (this broke the receipt upload flow once). **How to apply:** when adding ad-hoc endpoints (e.g. storage upload URL requests), import and use `customFetch`.

Rule 2: Server auth middleware must check the validated Clerk session FIRST and only fall back to the `x-guest-id` header when no session exists; the client must clear the guest id (setGuestId(null) + exit guest mode) once signed in. **Why:** if the guest header wins, a signed-in user whose stale guest id is still set reads/writes under the guest identity — a data-isolation bug flagged in code review. **How to apply:** keep the Clerk-before-guest ordering in `requireAuthOrGuest`-style middleware and the signed-in guard in the guest-id sync effect.
