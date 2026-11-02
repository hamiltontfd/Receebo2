# Account onboarding persistence

The web/PWA checklist is account data, separate from legal acceptance. It is
included in the existing preferences export and removed by the existing account
deletion flow. Completed and dismissed accounts remain hidden until account
progress has been read successfully; read failures are not treated as new users.

Receipt, search, completion and dismissal flags only advance. Saved receipts
prove the first step, not search or completion. Explicit dismissal does not
claim either step. Save/delete receipt transactions preserve first-step evidence.
Completion is persisted with the final step, before any celebration timeout.

## Legacy recovery boundary

The original browser keys `receebo:onboarding:searchDone` and
`receebo:onboarding:dismissed` contain no account ID, timestamp or verifiable
ownership. No server-side search/dismissal evidence was recorded by that
implementation. They are deliberately not imported into whichever account
happens to be active; a shared browser may have used multiple accounts.
Legal consent and the mere existence of receipts cannot prove completion.
Receipt ownership can safely recover only the first step. Browser-only progress
from another browser, private session or erased storage cannot be recovered.

New unsent writes have a per-account browser journal, flushed by a provider above
page routes, retried after failures/reconnection and retained across reloads.
Only acknowledged flags are removed. Storage failure retains in-memory retries
but cannot guarantee recovery after closing that browser. Progress that never
reaches the server cannot be visible on another device until synchronization
succeeds. Requests carry an expected-account guard to reject cookies that switch
accounts while a request is being sent.

## Regression coverage coordination

The existing returning-user flash test requirement is included here, not a
parallel implementation: delayed authentication and reads, read failures,
completed-account hydration, account switches and independent-client remounts
are covered by `src/lib/useOnboarding.test.tsx`. The API integration suite covers
real persistence, locks, stale/concurrent writes, deletion and account isolation.
No Expo onboarding behavior or legal acceptance policy is changed.
