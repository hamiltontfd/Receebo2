# Receebo web launch runbook

This is the operator checklist for a web-first release. The Expo app is not part of this launch.

## Marketing media release check

For product-page, shared UI/style, or fictional fixture changes, run the opt-in
`pnpm --filter @workspace/receiptr marketing:check` before release. A
`MEDIA REVIEW REQUIRED` result must be visually reviewed and acknowledged; it is
not permission to overwrite public images. See
[the capture and approval instructions](receebo-marketing-media.md#opt-in-release-freshness-gate).

## 1. Production configuration

Confirm these are set in the production environment without copying values into tickets or logs:

- Clerk publishable and secret keys
- Database connection
- Object storage bucket, private upload directory, and public search paths
- OpenAI integration base URL and key
- Stripe secret, monthly price, yearly price, and webhook secret
- Google OAuth client ID and secret
- Gmail token encryption key and session-signing secret
- Resend key
- Browser-push VAPID configuration, if push is enabled
- The canonical public application URL used by emails, redirects, and social metadata

Google OAuth must list the exact production Gmail callback URL. Stripe must use live-mode prices and deliver events to both the managed webhook and the application route expected by the deployment.

## 2. Safe test accounts

Use dedicated Clerk, Stripe test-mode, and Gmail test accounts. The Gmail mailbox must contain synthetic receipts only and no personal mail. Include:

- one valid PDF receipt
- one non-receipt PDF
- two copies of the same message
- a message with a temporarily failing attachment
- more than one receipt awaiting approval

Never point development or staging at a personal mailbox or live Stripe customer.

## 3. Pre-deploy checks

**Mandatory login gate, immediately before every publish:** run
`pnpm run test:login-gate` against the exact DEV workspace candidate about to be
published. **If it fails, do not publish.** Rerun after changing the candidate.
This is a manual release requirement, not a periodic check or a platform Publish
button hook. Never target production for this gate.

The default target is `https://$REPLIT_DEV_DOMAIN`; override only for a DEV preview
with `LOGIN_GATE_ORIGIN=https://<dev-preview> pnpm run test:login-gate`.
The gate first runs `clerkProxyMiddleware.test.ts` with
`vitest.clerk-proxy.config.ts` (no globalSetup or database writes), then tests
signed-out desktop/mobile login rendering. Do **not** substitute `test:api`, whose
globalSetup writes to DEV. Development-only settings
`CLERK_PROXY_ENABLED=1` and `VITE_CLERK_PROXY_URL=/api/__clerk` opt DEV into the same
first-party proxy path as production, using its existing development Clerk key.
Production behavior is unchanged and does not depend on the flag.
The browser gate requires the pinned bundles, requested npm chunks,
`/v1/environment` and `/v1/client` to return 2xx through the DEV `/api/__clerk`
proxy; it fails if those requests go directly to Clerk.
Services must load these settings before the live gate can run. Starting the API
executes migrations/backfills: obtain explicit approval before starting or
restarting either workflow; do not start them just to run an inspection.
Screenshots: `generated-artifacts/login-gate`.

Validate the failure guard with `LOGIN_GATE_FAIL_DEMO=1 pnpm run test:login-gate`
(or `pnpm --filter @workspace/receiptr run test:login-gate --fail-demo`): this must
exit non-zero using a temporary local loading/502 fixture, not the real app.
Browser executable overrides: `CHROMIUM_PATH` / `PWA_CHROMIUM_PATH`.

Run:

```sh
pnpm run typecheck
pnpm --filter @workspace/receiptr test
PORT=4173 BASE_PATH=/ pnpm --filter @workspace/receiptr build
pnpm --filter @workspace/api-server build
```

Confirm the database schema is current before serving traffic. A migration warning must be investigated; do not assume it is harmless.

## 4. Manual launch pass

Use fresh data and test desktop plus a narrow mobile browser:

1. Sign up, choose monthly, return from Checkout, and verify the trial activates once.
2. Repeat with yearly in a separate account.
3. Cancel in the Stripe portal and confirm access and dates match Stripe.
4. Upload JPG, PNG, and PDF receipts; reject a non-receipt; edit and save a partial extraction.
5. Search by merchant, product, category, and currency; open, download, attach, remove, and delete files.
6. Connect the dedicated Gmail mailbox, run a manual sync, review, approve, and dismiss pending imports.
7. Run another Gmail sync and confirm approved/dismissed messages do not reappear.
8. Toggle email reminders and browser push independently. Use dry-run tooling or synthetic dates so no unintended message is sent.
9. Install the PWA, reload it, test the offline shell, return online, and open a notification deep link.
10. Switch between two accounts and confirm neither account can read the other's receipt IDs, attachments, object paths, pending imports, or billing state.

## 5. Post-deploy checks

- Health endpoint responds through the public deployment.
- Server logs show startup migrations, scheduler startup, Stripe webhook setup, and no token-decryption errors.
- A test-mode webhook updates subscription state once when delivered repeatedly.
- Gmail manual sync reports checked/queued counts and transient failures remain retryable.
- Object cleanup logs counts and does not remove active upload intents.
- Error and latency monitoring is receiving events.
- Database backup/restore access has been verified by an operator.

## 6. Rollback

If launch checks fail:

1. Stop new traffic or disable the affected feature at the provider when possible.
2. Roll back the application to the last known-good Replit checkpoint/deployment.
3. Do not reverse a database migration until its compatibility and data-loss impact are understood.
4. Keep Stripe webhooks enabled unless duplicate processing is the incident; Stripe can replay missed events.
5. Preserve logs and record the time window, affected account IDs, and provider event IDs without storing secrets.
6. Re-run the manual checks for the affected flow before restoring traffic.

## 7. Launch sign-off

The release is ready only when engineering has completed this runbook, the separate privacy/terms work is approved, production URLs and provider dashboards are confirmed, and no P0/P1 issue remains open.