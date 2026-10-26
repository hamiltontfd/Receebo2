# Outlook import: research and implementation plan (26 Oct 2026)

## Status (26 Oct 2026, built by Grok Bot)

### What was built
- **Provider abstraction.** `artifacts/api-server/src/lib/mailProviders/` (`types.ts` MailProvider interface, `config.ts` feature flag, `candidates.ts` receipt heuristics + HTML-to-text). Shared pipeline `lib/mailSync.ts` (claim, download, AI extraction, pending queue, dedupe, retries) used by both providers. Gmail adapter lives in `lib/gmailSync.ts` (`gmailProvider`); PDF behaviour unchanged.
- **Outlook (Microsoft Graph).** `lib/outlookGraph.ts` (OAuth + Graph HTTP client, no DB) and `lib/outlookSync.ts` (encrypted tokens in `email_connections`, refresh-token rotation, scheduler every 4 h). Auth-code flow on `login.microsoftonline.com/{MICROSOFT_TENANT or common}`, scopes `Mail.Read offline_access User.Read openid email`, Web redirect `/api/outlook/callback`. Lists the last 90 days (`receivedDateTime` filter, newest first, pages via `@odata.nextLink`, max 2,000 scanned / 200 candidates per run), filters subject/sender in code, downloads non-inline PDF `fileAttachment`s (max 15 MB), honours `Retry-After` on 429/503/504.
- **HTML-body receipts (both providers).** No PDF, but sender/subject look like an order or receipt (EN/PT/ES/FR/DE/IT keywords, Amazon and common shop senders) → body converted to text → existing OpenAI extraction (`extractReceiptDataFromText`, same prompt; non-receipts rejected) → a generated text PDF is stored as proof of purchase → same pending-review queue. Max 25 body extractions per mailbox per run. Dedupe on provider + message id + attachment id (`body:html` for bodies). Gmail's search was widened to receipt-like subjects with or without PDF plus Amazon order senders (max 500 IDs per run).
- **Reconnect.** `invalid_grant` / `interaction_required` on refresh marks the connection `needs_reconnect` (Gmail and Outlook). Exposed in `/api/mail/status`, `/api/outlook/status`, `/api/gmail/status`; Settings shows a Reconnect banner per provider and the pending-imports list shows a banner linking to Settings. The scheduler skips `needs_reconnect` rows; manual sync still retries.
- **Gmail hidden, not deleted.** `MAIL_PROVIDERS_ENABLED` (comma list, default `outlook`). When Gmail is not listed: no Gmail card in Settings, scheduler not started, `/api/gmail/connect`, `/connect-url`, `/callback`, `/sync` return 404. `/api/gmail/disconnect` keeps working (revokes at Google), and a user who is still connected sees a "Gmail import is no longer available, Disconnect" card. All Gmail code, tokens and data are untouched. Set `MAIL_PROVIDERS_ENABLED=gmail,outlook` to bring Gmail back.
- **Routes.** New `/api/outlook/{status,connect,connect-url,callback,sync,disconnect}`, `/api/mail/status`, `/api/mail/sync`; the pending queue is served at `/api/mail/pending` and still at `/api/gmail/pending` (mobile app). OpenAPI not changed (the Gmail endpoints were never in the spec).
- **DB (additive, at boot in `src/index.ts`, mirrored in Drizzle schema).** New table `email_connections` (unique user_id + provider). New columns `provider text NOT NULL DEFAULT 'gmail'` on `pending_imports` and `gmail_seen_messages` (existing rows become `gmail` automatically), `status`/`last_error` on `gmail_connections`. Gmail tokens stay in `gmail_connections` (not copied) so there is one copy of each token. Nothing dropped or renamed.
- **Account data.** Export includes Outlook connections (no tokens); account deletion deletes them. Microsoft has no per-app token revoke, so disconnect deletes the stored tokens (users can also remove the app at https://account.live.com/consent/Manage or https://myapps.microsoft.com).
- **Web.** `artifacts/receiptr/src/lib/mailConnection.ts`, `components/MailConnections.tsx`, Settings and `PendingImports.tsx` updated. If no provider is enabled and configured, Settings shows "Automatic email import is coming soon".
- **Tests.** API: 194 passed, 2 skipped (was 140/2). Web: 164 passed (was 152). Typecheck clean.

### Environment variables (Replit Secrets; set for the workspace and the deployment)
| Variable | Needed | Notes |
|---|---|---|
| `MICROSOFT_CLIENT_ID` | yes | Application (client) ID from Entra. Without it Outlook stays hidden and inert. |
| `MICROSOFT_CLIENT_SECRET` | yes | Client secret **value**. Max 24 months, set a renewal reminder. |
| `MICROSOFT_TENANT` | no | Default `common` (personal + work accounts). `consumers` = personal only. |
| `MAIL_PROVIDERS_ENABLED` | no | Default `outlook`. `gmail,outlook` re-enables Gmail; `none` disables both. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | already set | Reused to encrypt Outlook tokens. `MAIL_TOKEN_ENCRYPTION_KEY` is accepted only if the Gmail key is absent. Never change it, or stored tokens stop decrypting. |
| `SESSION_SECRET` | already set | Signs the OAuth state. |

### What Hamilton must do
1. **Register the app in Microsoft Entra** (steps below, about 15 minutes).
2. **Add the Replit Secrets** `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` (and check that `GMAIL_TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET` also exist for the deployment).
3. **Restart the API in the workspace** and test with your own Outlook account at the dev URL (Settings > Connect Outlook). Check that an Amazon order email appears in "Found in your email".
4. **Publish from Replit.** On first boot the server adds the new table/columns. If Replit shows a production database schema review, the changes are additive (one new table, four new columns with defaults).
5. **Update the privacy policy and terms** to say Receebo reads Outlook mail (read-only) and email bodies of likely receipts are sent to OpenAI. Landing/FAQ copy still mentions Gmail.

### Entra setup (exact values)
1. Sign in to https://entra.microsoft.com with a **work or school** account (a free Microsoft 365 / Entra tenant is fine; a personal account cannot be publisher-verified later).
2. App registrations > New registration. Name `Receebo`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI, platform **Web**: `https://receebo.net/api/outlook/callback`. After creating, add a second Web redirect URI for development: `https://02feb0bc-b2aa-4b4d-94e9-f7333924aae3-00-awj1d691udvj.janeway.replit.dev/api/outlook/callback`.
4. API permissions > Add > Microsoft Graph > **Delegated**: `Mail.Read`, `offline_access`, `User.Read`, `openid`, `email`. No admin consent needed.
5. Certificates & secrets > New client secret (24 months). Copy the **Value** immediately into Replit Secrets as `MICROSOFT_CLIENT_SECRET`. Copy Overview > Application (client) ID into `MICROSOFT_CLIENT_ID`.
6. Branding & properties: home page `https://receebo.net`, privacy and terms URLs, publisher domain `receebo.net` (needs a DNS TXT record).
7. Later: join the Microsoft AI Cloud Partner Program and complete publisher verification (free) to remove the "unverified" label.

### Known limits / risks
- Not tested against a real Microsoft account yet (no credentials exist); tests use mocked Graph responses.
- Graph listing scans at most 2,000 messages per run; a very busy inbox may need a few runs to cover 90 days.
- HTML-body extraction adds AI cost (capped at 25 per mailbox per run) and can pick up order emails without prices; the AI rejects non-receipts and the user still approves each import.
- Organisations may block consent for unverified multitenant apps requesting `Mail.Read` until publisher verification.
- The Expo mobile app still calls the Gmail endpoints (out of launch scope).


Status: **built on 26 Oct 2026 (commits `3c8cede`, `7cb9c42`), not yet live.** Needs the Microsoft app registration, Replit Secrets and a publish (see "Status" below). Original research and plan kept underneath.

## Cost
- No mandatory paid assessment (unlike Google CASA). Publisher verification is free: https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview
- Verification needs: free Microsoft AI Cloud Partner Program account; app registered in an Entra tenant via a work/school account (not a personal MSA); DNS-verified publisher domain (receebo.net); MFA.
- Without verification: personal outlook.com/hotmail users see "unverified" on consent but can proceed. Some organisations block consent to unverified multitenant apps requesting Mail.Read.
- Microsoft 365 App Certification: separate, optional (judgment).

## How it works
- Delegated permissions: Mail.Read, offline_access, User.Read. Mail.Read works for personal and work/school accounts, no admin consent required by default: https://learn.microsoft.com/en-us/graph/permissions-reference (orgs may still restrict: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
- Refresh tokens: 90 days, replaced on every use, so regular syncs keep the connection alive (inference). Must store each new refresh token. Use a Web redirect URI (SPA tokens last 24h). https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
- Search: GET /me/messages?$search="..." (KQL: subject:, hasAttachments:true, received:), max 1,000 results; $search cannot be combined with $filter/$orderby. https://learn.microsoft.com/en-us/graph/search-query-parameter
- Attachments: /me/messages/{id}/attachments, fileAttachment.contentBytes (unverified).
- Incremental sync: delta per folder, no $search, receivedDateTime filter only. https://learn.microsoft.com/en-us/graph/delta-query-messages
- Throttling: 10,000 requests / 10 min, 4 concurrent per app per mailbox; honour Retry-After on 429. https://learn.microsoft.com/en-us/graph/throttling-limits

## Important gap (judgment)
Current import only takes PDF attachments. Amazon and many shops send HTML order emails with no PDF, so Outlook import as-is would miss the founder's own Amazon case. Also parse the HTML body (as text) through the existing OpenAI extraction when sender/subject look like a receipt.

## Entra (Azure) setup steps
1. entra.microsoft.com > App registrations > New registration (work-account tenant, so it can be verified later).
2. Supported account types: any Entra ID tenant + personal Microsoft accounts (endpoint `common`).
3. Platform Web; redirect URIs: https://receebo.net/api/outlook/callback and the Replit dev domain /api/outlook/callback.
4. API permissions > Microsoft Graph > Delegated: Mail.Read, offline_access, User.Read.
5. Certificates & secrets > new client secret (max 24 months; set a renewal reminder).
6. Branding: publisher domain receebo.net, privacy and terms URLs.
7. Later: join the Partner Program and verify the publisher.

## Code plan
- Today: artifacts/api-server/src/lib/gmailSync.ts (901 lines, two near-duplicate sync paths), routes/gmail.ts, tables created in api-server/src/index.ts. Token refresh failure only logs "token refresh failed" (silent failure). Stale comment in gmailConnections.ts says tokens are plaintext (they're encrypted).
- DB: new `email_connections` (user_id, provider, account_email, encrypted tokens, status active/needs_reconnect, last_error, last_synced_at, delta_link; unique user_id+provider). Add provider + provider_message_id to pending imports and seen-messages; back-fill Gmail rows.
- Code: lib/mailProviders/types.ts (MailProvider interface: buildAuthUrl, exchangeCode, refresh, listCandidates, getAttachments, getBody, revoke); gmailProvider.ts (moved), outlookProvider.ts (Graph via fetch or @azure/msal-node); shared mailSync.ts pipeline + one scheduler; routes/outlook.ts or /mail/:provider/*; add auth middleware entries in routes/index.ts.
- Tokens: reuse tokenCrypto.ts; MAIL_TOKEN_ENCRYPTION_KEY with fallback to GMAIL_TOKEN_ENCRYPTION_KEY.
- Env: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT=common, MAIL_PROVIDERS_ENABLED=outlook.
- Reconnect: on invalid_grant set needs_reconnect, expose in /status, banner in settings.tsx and pending imports, optional Resend email.
- Frontend: generalise gmailConnection.ts into mailConnection.ts; one settings card per provider.
- Gmail off: exclude from MAIL_PROVIDERS_ENABLED (hide UI, skip scheduler, routes 404); keep code and data; keep disconnect working so tokens get revoked.
- Effort (judgment): 4-6 dev-days abstraction + Outlook; +1-2 HTML body parsing; +1 tests. Publisher verification: a few days of paperwork.

## Risks
Org tenants blocking consent until verified; client secret expiry (24 months max); search index lag; HTML parsing raises AI cost and false positives; privacy policy must disclose Outlook mail access.
