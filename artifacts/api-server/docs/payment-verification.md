# Payment verification — 2026-10-26

## Status

The redirect defect is fixed in source. Payments are **not certified ready for
customers**. No live charges, subscriptions, portal configurations, webhooks,
credentials, prices, or deployments were created or changed during verification.

## Code and isolated verification

- Production checkout success returns to `https://receebo.net/search?checkout=success`.
- Checkout cancellation returns to `https://receebo.net/search?checkout=cancel`.
- The customer portal returns to `https://receebo.net/settings`.
- Production ignores workspace-domain variables and client-supplied destinations.
- Development uses a validated workspace domain and fails before creating Stripe
  resources when that configuration is missing or unsafe.
- HTTP route tests use an ordinary, non-owner identity and production entitlement
  rules, avoiding the development subscription bypass.
- Local fixtures cover both prices, existing customers, authentication, consent,
  checkout and portal errors, and the free → trial → cancellation → expired
  entitlement transition, plus active renewal.
- Real Stripe signature generation/verification is exercised locally, but the
  Stripe sync adapter, Stripe API, authentication provider and database are mocked.
  This is **not** a Stripe-hosted checkout or browser end-to-end test.
- Existing owner-access feature-route tests continue to verify the separate
  owner exemption and ordinary paid-user access.

Verification command:

```sh
pnpm --filter @workspace/receiptr exec vitest run --config vitest.api.config.ts \
  src/lib/billingUrls.test.ts src/routes/billingFlow.test.ts \
  src/routes/ownerFeatureAccess.test.ts
```

28 tests passed; API TypeScript checking passed.

## Read-only Stripe findings

Two credential paths were checked separately:

1. **Connector:** test mode. The configured price identifiers resolve to active
   EUR 2.99/month and EUR 24.99/year prices with seven-day trials. Only an enabled
   workspace webhook was returned. No portal configurations were returned.
2. **Effective workspace backend client:** the explicit application key takes
   precedence over the connector and accesses **live mode**. Active monthly and
   yearly prices exist, but retrieving each configured monthly/yearly price
   identifier with this client returned **404**. Therefore the workspace's
   effective credentials and configured price identifiers do not match.
   Only an enabled workspace webhook was returned, with no production-domain
   endpoint. No portal configurations were returned.

Neither inspection proves which credentials the deployed process is using.
Shared configuration metadata is not proof of the values in a running release.
Never copy connector test identifiers into a live-key environment.

## Published-site observations and remaining limits

- Deployment metadata reports a successful public deployment at `https://receebo.net`.
- An unsigned POST to its Stripe webhook returned HTTP 400 with
  `Missing stripe-signature`. This proves route reachability and the missing-header
  guard only, **not** successful delivery, signature verification or subscription activation.
- Read-only production database access was refused because the session lacks an
  authenticated production-database user. No production database data was read.
- Production prices, delivery history and effective credentials remain unverified.
- No isolated Stripe-hosted checkout, portal cancellation, or signed-in UI
  end-to-end run was performed. Creating a live session or reusing the ordinary
  development backend would not be a safe substitute: that backend has live
  credentials and startup integration side effects.
- Before customer launch, separate test/live configuration, resolve the price
  mismatch, configure and verify the intended environment's webhook and portal,
  and run the real checkout/activation/portal journey in an isolated Stripe test
  environment with an ordinary user.
- Publishing the redirect fix does not by itself repair Stripe configuration.
