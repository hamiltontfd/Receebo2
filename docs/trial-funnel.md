# No-card trial funnel

This is first-party PostgreSQL instrumentation, not the PWA installation tracker
or Replit-hosted page analytics. It needs no tracking script or analytics cookie.
Only new activity after the migration is counted; existing trials are not backfilled.

## Privacy and event ownership

The event stream contains a random subject UUID, event name, fixed interval/reason
values and timestamp. No receipt IDs, merchants, text, amounts, email addresses,
Clerk IDs, IP addresses, URLs or Stripe IDs are stored in events. A separate
restricted identity mapping supports deduplication and account erasure. This is
pseudonymous, not irreversibly anonymous. Account deletion cascades to events and
checkout attempts. Reports return aggregates only; there is no public reporting endpoint.

| Event | Source and deduplication |
| --- | --- |
| `consent_accepted` | Successful legal-acceptance insert, once per new subject. Not a separate marketing or cookie consent. Existing trials/subscribers renewing consent are excluded. |
| `account_trial_started` | Actual account-trial insert, once, never polling or button clicks. |
| `first_receipt_succeeded` | Trial ledger reaches one successful receipt. |
| `third_receipt_succeeded` | Trial ledger reaches three successful receipts. |
| `paywall_viewed` | Actual visible gate, authenticated and server-validated reason, once per expiry/exhaustion reason. Does not fire for Settings, final receipt review, loading or activation screens. |
| `plan_selected` | Explicit valid monthly/yearly checkout request, once per interval, including checkout creation failures. No preselected/default-plan event. |
| `checkout_canceled` | Return through Stripe's cancel link with an opaque attempt UUID belonging to the signed-in subject, once per attempt. Closing the tab is not observable and is not labeled canceled. |
| `paid_activation_confirmed` | Verified webhook or subscription polling, one shared DB uniqueness key. Requires synced active founding subscription plus a positive paid invoice for that subscription in the same Stripe environment. A success URL, grace access, unpaid invoice or legacy Stripe trial is insufficient. |

Receipt milestones are transactionally recorded by a ledger trigger for camera/file
extraction, manual acceptance, Gmail approval and guest claims. Failed/reserved/
processing entries do not count. A trial-row lock serializes parallel successes.
Deleting a receipt does not undo a milestone. Event uniqueness works across
processes, tabs, polling and webhook retries. Operational billing remains usable
if a non-transactional analytics write fails (a content-free warning is emitted).

## Read-only conversion report

Run in the workspace:

```sh
pnpm --filter @workspace/api-server report:trial-funnel 2026-10-01T00:00:00Z 2026-11-01T00:00:00Z
```

Use ISO timestamps with timezone. Bounds are inclusive `from`, exclusive `to`.
The command queries whichever database the executing environment is configured
to use; it does not choose or connect to production automatically.

The acquisition section counts consent accepted in the range and how many of
those subjects subsequently started a trial. The conversion section cohorts
trials **started in the range**, then counts their outcomes through report time
(including outcomes after the range). These are distinct denominators.

Conversion output includes overall, interval-only, reason-only and combined
breakdowns. Each subject belongs to exactly one interval (first explicit selection,
or `not_selected`) and one reason (first paywall actually seen, or `not_viewed`).
A person seeing exhaustion then expiry is assigned to exhaustion. Switching
plans does not move the first-selection cohort; `paid_monthly` / `paid_yearly`
show the actual paid interval. Subtotals overlap intentionally; do not add them.

Rates are paid/trials, paid-and-selected/selected, and paid-and-viewed/viewed.
Zero denominators produce null, not fabricated zero conversion. Stage counts
show drop-off but are not assumed to be strictly sequential: users can subscribe
before a third receipt or without viewing a paywall. Recent cohorts have not
finished their seven days; allow time before comparing conversion. Cancellation
counts represent subjects who explicitly returned canceled, not abandonment.
