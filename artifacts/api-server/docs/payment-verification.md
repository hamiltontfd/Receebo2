# Payment verification — 2026-10-26

## Current status

The code and test environment are verified, including a real hosted Stripe
Checkout and portal cancellation with an ordinary authenticated test user.
Production configuration is prepared, but the new backend and production webhook
registration are **not active until the owner republishes**. Do not describe the
currently published release as payment-certified.

No live charges, customers, subscriptions, refunds or deployments were created.
With the owner's explicit approval, separate non-secret test/live price and portal
settings were saved, and a portal configuration was created in each Stripe account.
No existing prices, subscriptions or webhook endpoints were deleted or modified.

## Fixes

- Checkout success/cancellation returns to the verified `receebo.net` origin in
  production and the validated workspace origin in development. Client-provided
  hosts, redirect parameters and workspace variables cannot override production.
- Development cannot use a shared live credential. It uses an explicit test key
  or the test-mode connector; production requires an explicit live key.
- Separate test/live price identifiers resolve correctly. Prices are checked for
  mode, currency, amount, recurrence and active status before customer creation.
- Explicit portal configurations enable payment-method updates, invoice history
  and cancellation at period end.
- Subscription queries filter by Stripe mode and support modern item-level
  period dates and scheduled `cancel_at`, not just `cancel_at_period_end`.
- The trial-ending webhook reminder respects both cancellation fields.
- The existing Stripe migration runner now resolves relative to the deployed
  bundle rather than the current working directory. Webhook registration uses
  the trusted environment origin, not the first runtime domain.
- Normal free development access and complimentary owner access are preserved.
  The hosted verification process explicitly enforces test subscriptions.

## Verification

35 isolated tests passed, covering trusted redirects, ordinary-user lifecycle,
price mismatch protection, credential isolation and existing owner access.
The complete API suite also passed: 104 tests, with the opt-in hosted journey
skipped in that default run and passed separately below. API TypeScript checking
passed, and the managed API workflow restarted successfully.

```sh
pnpm --filter @workspace/receiptr exec vitest run --config vitest.api.config.ts \
  src/lib/billingUrls.test.ts src/routes/billingFlow.test.ts \
  src/routes/ownerFeatureAccess.test.ts src/stripeClient.test.ts
```

One additional **real hosted browser journey passed**:

```sh
RUN_STRIPE_HOSTED_E2E=true pnpm --filter @workspace/receiptr exec vitest run \
  --config vitest.api.config.ts src/routes/billingHosted.test.ts
```

That opt-in test:

1. Requires test-mode Clerk and Stripe credentials and creates a disposable,
   non-owner Clerk user.
2. Signs the browser in using a genuine short-lived Clerk sign-in ticket.
3. Calls the real Express app with Clerk verification and legal acceptance.
   Neither authentication, Stripe, the database nor Stripe Sync is mocked.
4. Confirms the ordinary user is free with the development bypass disabled.
5. Opens a real Stripe-hosted monthly checkout and submits the standard test card.
6. Verifies the browser returns to the development `/search?checkout=success`.
7. Waits for the ordinary API's actual signed Stripe webhook and database sync,
   then verifies trial access, non-owner status and the exact seven-day period.
8. Opens the real portal, requests cancellation and observes the real Stripe
   update and the corresponding cancellation flag in Receebo.
9. Confirms access remains trialing during the scheduled cancellation period.
10. Cancels/deletes the disposable test subscription/customer and removes the
    test Clerk user and application billing/legal records in cleanup.

The signed-in browser and hosted checkout/portal were exercised, but the React
plan-gate transitions were not asserted: entitlement checks used the real API in
an isolated process that enforces test subscriptions. Normal preview access
intentionally remains free.

## Production evidence and activation boundary

- Deployment metadata confirms the existing public release at `https://receebo.net`.
- An unsigned webhook request returns HTTP 400, proving route reachability only.
- The effective live client resolves active EUR 2.99/month and EUR 24.99/year
  prices. Their identifiers and the live portal configuration are saved in the
  production-specific configuration, separate from development.
- The live account initially had only a workspace webhook. No managed production
  webhook is active yet: the existing release must be replaced to register one
  and store its signing secret in its own database safely.
- After the owner authorized configuration, read-only production database access
  became available. Inspection found no `stripe` tables. No production DDL or
  data writes were attempted. The owner must review the schema changes surfaced
  by publishing; the corrected existing migration runner is included in the new
  backend. Do not manually push development data into production.
- Live configuration was validated with read-only Stripe calls and saved
  environment metadata, not a live checkout or payment. A running older release
  can still have old values until republished.
- After publication, verify successful production Stripe initialization, the
  canonical live webhook and actual event delivery before inviting paying users.
  No automatic publication or live payment test was performed.
- Development startup still reports the pre-existing duplicate `handle_updated_at`
  trigger migration warning. It continues successfully, registers the test
  webhook and completes Stripe backfill; the hosted journey passed against this
  environment. Do not interpret that warning as successful migration execution
  in a fresh production environment; review startup logs after publishing.
