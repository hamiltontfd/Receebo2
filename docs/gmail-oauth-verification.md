# Gmail OAuth setup verification

Verified on **2026-10-25** using the connected browser and the authenticated
Receebo development application. This is a record of external configuration
and live verification, not a new implementation of Gmail import.

## External Google configuration

- Existing Google Cloud project: `receebo`.
- Existing OAuth client: **Receebo Gmail**, verified as a **Web application**.
- Gmail API was disabled; enabled it in this existing project.
- Consent data-access settings had no scopes. Added and saved exactly:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/userinfo.email`
- Reloaded the consent settings and confirmed both scopes persisted.
- Kept the consent application in **Testing**, with its existing external
  audience and one existing test user. The approved account successfully
  completed Google's authorization flow.
- Did not edit the separate `receebo-sign-in` project.

### Authorized development URLs

The authenticated running application's `/api/gmail/connect-url` response
was inspected without displaying its state or complete authorization URL.
It used the existing Gmail client, the two scopes above, offline access,
and this exact redirect URI:

```text
https://02feb0bc-b2aa-4b4d-94e9-f7333924aae3-00-awj1d691udvj-16aa3jhu.janeway.replit.dev/api/gmail/callback
```

Added and saved this JavaScript origin and matching redirect URI:

```text
https://02feb0bc-b2aa-4b4d-94e9-f7333924aae3-00-awj1d691udvj-16aa3jhu.janeway.replit.dev
https://02feb0bc-b2aa-4b4d-94e9-f7333924aae3-00-awj1d691udvj-16aa3jhu.janeway.replit.dev/api/gmail/callback
```

Reopened the existing Web client and confirmed both development entries were
saved and the original production callback remained present:

```text
https://receebo.net/api/gmail/callback
```

These development entries are specific to the verified workspace. A different
workspace hostname requires its own authorized origin and callback; this test
does not assert that arbitrary development hosts are authorized.

## Credentials and scope boundaries

Presence-only inspection confirmed `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GMAIL_TOKEN_ENCRYPTION_KEY` exist in Replit Secrets.
No secret was replaced, rotated, downloaded, printed, or committed.
Successful token exchange, persistence, and subsequent authenticated sync
also verified the existing credentials and encryption key work together.

No consent-app publishing, Google verification submission, production
deployment, Google sign-in credential change, or Users & Auth change occurred.

## Authenticated connection and controlled import

The user explicitly approved Gmail read-only authorization and receipt scanning,
then separately approved sending one fictional receipt email to their own
connected Gmail account. Account addresses and private email contents were not
included in inspection output or this record.

| Check | Observed result |
| --- | --- |
| Initial signed-in `/api/gmail/status` | HTTP 200; configured true; connected false; pending count 0 |
| Google authorization | Account selection, expected Testing/unverified notice, and consent completed; returned to Receebo `/settings` |
| Status after callback and page reload | HTTP 200; connected true; last-synced timestamp present |
| Initial manual `/api/gmail/sync` | HTTP 200; checked 0; queued 0 |
| Controlled email | Gmail confirmed one message sent to the same account connected to Receebo |
| Controlled PDF | `receebo-gmail-oauth-test.pdf`; generated in memory; explicitly fictional, no real purchase or payment |
| Sync after test email | HTTP 200; checked 1; queued 1 |
| Persisted `/api/gmail/pending` after reload | HTTP 200; exactly one matching test PDF; extracted total 24.60 EUR |
| Repeat sync | HTTP 200; checked 0; queued 0; no duplicate |
| Final signed-in Settings UI | Disconnect control available; **1 pending** displayed |
| Final authenticated status and pending check | Connected true; exactly one matching controlled import still pending |

The fictional receipt was intentionally **not approved or dismissed**. The
approved test verified import into pending review, and the user was told it
would remain there rather than become a real receipt in their library. No
additional approval/deletion side effect was needed to verify OAuth setup.

## Implementation boundary

The existing OAuth, encrypted token storage, Gmail sync, extraction, object
storage, and pending-review paths worked without application-source changes.
The task's changes are external Google configuration plus this sanitized
verification record and an internal note about differing workspace origins.
Unrelated marketing/PWA changes inherited from the main branch are not part of
this Gmail setup work.
