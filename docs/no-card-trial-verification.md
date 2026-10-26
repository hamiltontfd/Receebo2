# No-card founding trial: verification and operations

## Verified on 2026-10-26

- Workspace TypeScript checks passed, including web, API, native mobile and shared packages.
- Web tests: 142 passed.
- API tests: 116 passed; the separately opted-in hosted Stripe test also passed.
- PostgreSQL-backed tests exercise consent and idempotent initialization, exact seven-day expiry, third/fourth receipts, concurrent reservations, deletion, expired/released upload paths, non-receipt and extraction-failure releases, manual acceptance, supporting attachments, Gmail approvals, guest migration, protected interval pricing, checkout failures and duplicate-subscription prevention.
- Existing owner, paid, legacy Stripe-trial, cancellation, signed-webhook and privacy regression tests passed.
- A real ordinary Clerk test user accepted legal consent in a 390×844 browser and entered the application with three uploads and seven days remaining, without a Stripe customer or payment method. The signed-in screen was captured and inspected.
- Explicit early upgrade completed through real hosted Stripe **test mode**. The subscription became active immediately with no Stripe trial. Real webhook synchronization and hosted portal cancellation were verified; fixtures were cleaned up.
- The signed-out mobile landing page was visually checked. Web/PWA production build passed, including the generated service worker and precache.
- Checkout cancellation, delayed confirmation, quota errors and trial-start recovery are also covered by local fixtures/UI tests.

## Not claimed

- No live payment, live subscription change, live price/portal reconfiguration or publication was performed.
- No physical-device installed-PWA journey, native onboarding change, or real Gmail mailbox import was performed. PWA behavior has automated regression coverage; Gmail acceptance uses database-backed fixtures.
- Do not infer production billing configuration from the successful sandbox checkout.

## Operational requirements

- Merge applies the additive application schema through the existing development schema process. The production schema must include the new entitlement/usage tables and attachment intent field when the changes are eventually published through the normal platform flow.
- Production must resolve the matching live EUR recurring prices (€2.99 monthly / €24.99 yearly). Keep the protected founding prices available for eligible accounts and ensure any portal plan-switch configuration does not offer unprotected replacement prices. Checkout fails explicitly for inactive, wrong-mode, wrong-amount or wrong-interval prices rather than silently repricing.
- Existing startup warnings remain: the Stripe migration helper reports an already-existing subscription trigger before normal webhook sync succeeds, and the web build warns that `VITE_APP_URL` is unset. These are not introduced by this change and have existing follow-up work.
