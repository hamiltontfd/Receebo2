# Receebo: Cursor + Grok Bot working log

A running record of setup decisions, findings and to-dos while testing Cursor + Grok Bot for editing Receebo (trial started 26 Oct 2026, roughly one month). Newest entries at the top of each section.

## How we work
- Receebo stays hosted and deployed on Replit. Replit remains the source of truth.
- Editing happens in Cursor on Hamilton's Mac over SSH, directly on the Replit workspace (`/home/runner/workspace`). No local copy, no GitHub mirror.
- Grok Bot (the "Replit Cursor Setup" assistant) reads and edits over the same SSH connection and keeps this log updated.
- Deploys/publishing are still done from Replit.

## Setup (26 Oct 2026)
- Generated SSH key on the Mac at `~/.ssh/replit` (ed25519, comment `replit-cursor`).
- Added to `~/.ssh/config`: a `Host *.replit.dev` block using that key, plus a `receebo` shortcut (HostName `ssh.janeway.replit.dev`, port 22).
- Public key added to the Replit account (Settings > Profile > SSH Keys) as "Cursor - Laptop-de-Hamilton".
- Verified: SSH login, read and write to the workspace, Cursor opened on `/home/runner/workspace` via Remote-SSH.
- To reconnect: Cursor > Command Palette > "Remote-SSH: Connect to Host..." > `receebo` > open `/home/runner/workspace`.
- Known, harmless: Cursor warns "Terminal sandbox could not start (AppArmor)". Replit containers don't allow Cursor's agent sandbox and we have no root. Effect: Cursor Agent terminal commands run unsandboxed or ask for approval. Review commands before approving, since they act on the live workspace.
- Note: while locating the SSH tool, Replit Agent tasks #206 (failed-payment notifications) and #207 (trial-to-subscribe funnel) appeared as started. Possibly triggered by accident. Check whether to keep or stop them.

## What Receebo is (review, 26 Oct 2026, read-only)
Receipt keeper PWA for everyday shoppers (PT/EU focus): capture receipts (upload, photo, Gmail import), AI extraction into searchable data, return-window reminders.
- Capture: JPG/PNG/PDF; OpenAI extraction in `lib/receiptExtraction.ts` (merchant, date, total, line items, warranty, country).
- Return windows: `lib/returnWindowCalc.ts` (PT/EU 14 days, BR 7, Amazon/Zalando 30). Reminders by email (7 and 2 days before) and web push (2 and 1 day before).
- Email import: Outlook (Microsoft Graph) and Gmail share one pipeline (`lib/mailSync.ts`): PDF attachments plus HTML order emails into a review queue. Gmail hidden by default via `MAIL_PROVIDERS_ENABLED` (since 26 Oct 2026, see `docs/outlook-integration-plan.md`).
- Guest mode with claim-on-signup (`/guest-session/claim`); data export, account deletion, Owner tier.
- Stack: pnpm monorepo. Web `artifacts/receiptr` (React 19, Vite, Tailwind, Radix, PWA). API `artifacts/api-server` (Express 5). PostgreSQL + Drizzle (`lib/db/src/schema/`). Google Cloud object storage. OpenAPI contract in `lib/api-spec`. Expo app in `artifacts/receiptr-mobile` (not in launch scope). Replit autoscale deployment, production at receebo.net.
- Services: Clerk (auth), Stripe (billing), Gmail via Google OAuth, Resend (email), web-push, OpenAI, GCS.
- Pricing: no-card trial, 7 days, 3 receipts total (`TRIAL_LIMIT = 3` in `lib/accountTrial.ts`; uploads, attachments, Gmail approvals and guest claims all count; deletes don't refund). Paid: EUR 2.99/month or EUR 24.99/year; checkout validates exact price/currency/interval (`routes/billing.ts`). Founding price IDs locked at trial start.

## Open to-dos before launch
- [ ] Production DB tables for the no-card trial, live EUR Stripe prices, billing portal limited to protected prices; no live payment tested yet (`docs/no-card-trial-verification.md`).
- [ ] Gmail OAuth still in Google "Testing" mode; needs Google verification (`docs/gmail-oauth-verification.md`).
- [ ] Set `VITE_APP_URL` for the web build; Stripe migration "existing trigger" warning on boot.
- [ ] Launch runbook checks plus privacy/terms approval (`docs/RECEEB0_LAUNCH_RUNBOOK.md`).
- [ ] Fill in `replit.md` (still the template); old name "receiptr" remains in places.
- [x] Confirm the OpenAI model name in code ("gpt-5.4") is valid (it is).
- [ ] Confirm whether the latest commit `7e1c0ac` (no-card trial) is live on receebo.net.
- [x] Replit Agent tasks #206 and #207: applied and published by Hamilton (26 Oct 2026).
- [x] Gmail: Testing-mode consent expires after 7 days; sync failed silently. Fixed 26 Oct 2026: `needs_reconnect` status + Reconnect banners for Gmail and Outlook (email notification not added).
- [ ] Fix return window: count 14 days from delivery, not purchase date (Directive 2011\/83\/EU Art. 9).
- [x] ~~Consider replacing Gmail OAuth with an inbound forwarding address~~ Decided 26 Oct 2026: Outlook direct connection instead; Gmail hidden behind a flag (forwarding kept only as a possible fallback).
- [x] Build Outlook import + HTML-body receipts + hide Gmail (commits `3c8cede`, `7cb9c42`, 26 Oct 2026).
- [ ] Register the Receebo app in Microsoft Entra (work-account tenant; redirect URIs, permissions, client secret). Steps in `docs/outlook-integration-plan.md`.
- [ ] Add Replit Secrets `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (optional `MICROSOFT_TENANT`, `MAIL_PROVIDERS_ENABLED`); confirm `GMAIL_TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET` exist for the deployment.
- [ ] Test Outlook end to end with Hamilton's own account on the dev URL (Amazon order email should appear), then publish.
- [ ] Disconnect the old Gmail test connection from Settings once Outlook works (revokes Google access).
- [x] Update privacy policy/terms and landing/FAQ copy for Outlook (commit `00057db`, 26 Oct 2026; session 11).
- [ ] Legal: decide whether the Outlook privacy/terms change is "material". If yes, bump `TERMS_VERSION`/`PRIVACY_VERSION` in `api-server/src/lib/legalAcceptance.ts` together with the "Effective 30 August 2026" date in `receiptr/src/components/LegalPageLayout.tsx` (forces every user to re-accept). Not done in session 11.
- [ ] Legal review of the new privacy section 5 (Microsoft Graph scopes) and the "earlier Gmail connections" note; confirm whether Google API Limited Use wording is needed while legacy Gmail tokens exist.
- [ ] Legacy Gmail tokens stay stored (encrypted) but are no longer synced. Data minimisation: revoke/delete them automatically, or at least disconnect Hamilton's own test connection.
- [ ] Re-record the marketing screenshot `email-settings.webp` (still shows Gmail; no longer used on the landing, replaced by a coded illustration). Marketing capture fixtures `scripts/marketing/{fixtures,record}.mjs` still mock `/api/gmail/status` and click "Connect Gmail".
- [ ] Mobile Outlook connect is wired (opens Microsoft sign-in, polls `/mail/status`) but untested on a device; OAuth callback returns to the web Settings page, not the app.
- [ ] Until `MICROSOFT_CLIENT_ID`/`SECRET` are set, `/api/mail/providers` is empty: the landing then says "connect your inbox" and Settings shows no inbox option. Do not publish the copy change before Outlook is configured and tested.
- [ ] Publisher verification with Microsoft (free; Partner Program + DNS-verified receebo.net).
- [ ] Client secret expires (max 24 months): set a renewal reminder.
- [x] New free trial: 15 days, no card, up to 5 receipts, view-only at the cap, paywall on day 16 (commit `7c23732`, session 12).
- [ ] Legal: the terms trial clause changed in session 12 (15 days / 5 receipts / view-only at cap). Decide with the Outlook change whether to bump `TERMS_VERSION`.
- [ ] Trial funnel still has `third_receipt_succeeded` (3rd receipt); decide whether to add a 5th-receipt event. `paywall_viewed` with reason `trial_exhausted` will now rarely fire (the cap no longer shows the paywall).
- [ ] Wire pt-PT / pt-BR for the cap notice when the app gets i18n (strings in `receiptr/src/lib/trialCopy.ts`).
- [x] Email fixes from the Resend audit: links, error handling, escaping, unsubscribe, dedup, daily lock, reminders only for users with access, receipt-ready email removed, Outlook-only copy (commit `ec6b20d`, session 13).
- [ ] Verify receebo.net in Resend (DNS at Name.com) and set `RESEND_FROM` / `RESEND_REPLY_TO` Secrets. Steps in `docs/email-sending.md`. Until then only the Resend account owner receives email.
- [ ] Lifecycle emails (welcome, trial start/end, deletion after 60 days): copy and design with marketing first; build on `renderEmailLayout()`.
- [ ] Remove the legacy Gmail notes in privacy/terms once no Gmail tokens remain in production.
- [ ] After publishing subscriptions/reminders: read the startup log line "Purchase type backfill dry run" (counts per type and merchant). If it looks right, set `PURCHASE_TYPE_BACKFILL=apply` for one restart (or run `pnpm --filter @workspace/api-server run backfill:purchase-types -- --apply`), then remove the variable.
- [ ] After publishing the 4 h mail sync: create a second cron-job.org job, POST `https://receebo.net/api/internal/cron/mail-sync`, header `x-cron-secret` (production `CRON_SECRET`), crontab `0 */4 * * *`, time zone Europe/Lisbon. Keep the 06:00 daily-maintenance job. Steps in `docs/daily-cron.md`.

## Decisions
- 26 Oct 2026: Keep hosting on Replit; trial Cursor + Grok Bot for ~1 month via SSH. No Cursor cloud Project for now (would require a GitHub/Origin copy and two-way sync). Revisit at end of trial.

- 26 Oct 2026: Email import moves to Outlook (no yearly paid assessment). Gmail hidden with `MAIL_PROVIDERS_ENABLED` (default `outlook`), code and data kept so it can return if Google CASA becomes worth paying for.

- 26 Oct 2026: Critical business review done (see hackathon-log session 4). Leaning toward free tier + pivot exploration; no decision yet.

- 26 Oct 2026 (session 11): Provider names in marketing copy come from public `GET /api/mail/providers` (same flag as Settings), never hard-coded. Legal pages stay static and describe Microsoft only, plus a legacy-Gmail note; if Gmail is re-enabled, the privacy policy must be updated again. Forwarding is not mentioned in marketing copy.

- 26 Oct 2026 (session 12): Free trial = 15 days + 5 receipts, not "whichever comes first". At 5 receipts the account is view-only (view, search, files, export, alerts) until day 15, then the paywall. Existing trials extended to 15 days from their original start at server boot (also reopens recently expired 7-day trials). Attachments to an existing receipt stay allowed at the cap.

- 26 Oct 2026 (session 13): No per-receipt "receipt ready" email. Warranty and return reminders (email + push) only for users with current access (active trial incl. at the cap, paid, legacy Stripe trial, owner). Sender stays the Resend test sender until receebo.net is verified. Email import copy says "Outlook only for now" while Outlook is the only provider.

- 28 Oct 2026: Hamilton: "Muda para rodar de 4 em 4 horas". Outlook mail sync runs every 4 h from a new endpoint, `POST /api/internal/cron/mail-sync` (same `x-cron-secret`, 503 without `CRON_SECRET`), which runs only the Outlook sweep. A connection counts as fresh for 3 h (`OUTLOOK_SWEEP_FRESH_MS`, was 20 h). Reminder emails, warranty/return/trial sweeps, orphan cleanup and account retention stay once a day in `daily-maintenance` (they are claimed for ~23 h, so calling them more often would do nothing). The daily call still runs the sweep as a fallback. Each sync is incremental: it lists only mail received since the mailbox's last complete sync minus 1 h (90 days on the first sync, never more), and a run that left messages for later (trial limit, per-run caps, retryable failures) keeps the window where it was so nothing is lost. cron-job.org needs a new 4-hourly job (see the to-do above).

- 28 Oct 2026: Subscriptions (Apple iCloud+/Apple One, "Renews"), one-off digital purchases (App Store apps, films, in-app) and event tickets get no return window, no legal or manufacturer warranty and no reminders (email or push). New `receipts.purchase_type` (goods/subscription/digital/service/ticket) and `purchase_type_source` (ai/hint/manual): manual switch "This is a subscription" > AI > deterministic hints. Services are treated the same (proposal §5). Old receipts are fixed only by the gated backfill (dry run by default); `WARRANTY_CALC_VERSION` stays 3 so boot never rewrites them. Reminder emails and pushes show the product and the amount (Marketing copy of 28 Oct, PT/EU parts).

- 29 Oct 2026: Hamilton approved the Designer's navigation spec B ("Bora"; `mockups-nav/NOTES.md`). Mobile gets a bottom tab bar, Search · Add · Stats; Add is a black + in the centre that opens a sheet with Scan receipt (full-screen camera, tab bar hidden, X back to the previous tab, flash when the device has a torch, PHOTO · LONG RECEIPT switch) and Upload file (same JPG/PNG/PDF upload). Search is the home without the camera button or Worth keeping. The new `/stats` tab shows the Protected value dashboard from real receipts: each receipt counts once, the return window while it's open and the warranty after that; unknown deadlines are shown but not counted; subscriptions, digital purchases, services and tickets are left out; currencies are never converted. Worth keeping moved there. Profile stays the header avatar; Profile, Settings and Recurring suppliers get a Back header and the tab bar with no tab active. Desktop header tabs are Search · Add · Stats (Add opens the current `/scan` page). A dot on Search shows when imports are pending and you're on another tab. Branch `nav-b`, web only, no API change.

- 29 Oct 2026: Hamilton: "vamos ignorar lixo e spam". A fake "Geek Squad" invoice (phishing) was imported from his Outlook Junk Email folder because the listing used `/me/messages` (all folders). Outlook sync now resolves the well-known `junkemail` folder once per run and skips messages whose `parentFolderId` matches (client side; the `receivedDateTime` filter/order is unchanged). Deleted Items and all other folders are still read. If the junk folder can't be resolved, sync goes on without that filter and logs a warning. Every Outlook path (first connect, 4-hourly, daily sweep, full search) goes through `listOutlookCandidateIds`. Gmail: `messages.list` never sets `includeSpamTrash` and its queries don't use `in:spam`/`in:anywhere`, so Spam and Trash are already excluded. Pending items already imported from junk are not touched; they can't be told apart from stored data (no folder id is saved), only by asking Graph for each message's `parentFolderId`. Branch `skip-junk`.

- 29 Oct 2026: An Apple One pending in production showed Dismiss / Accept instead of Always import. Cause: supplier detection read only the stored purchase type, and pendings imported before purchase types existed have none (the sheet shows the hint-based type). Detection now uses the same type as the sheet. Apple, Google and Microsoft are "mixed stores" (subscriptions and one-off purchases from the same sender): only their subscription receipts count as the supplier, get Always import, and are affected by on/off. One-off App Store purchases and hardware keep Accept and are never auto-imported or dropped by that decision. Apple's merchant names share one key (`apple`). Branch `skip-junk`.

- 29 Oct 2026: Hamilton asked for two receipt-details fixes. (1) The Highlights row of item cards couldn't be scrolled on desktop (a big IKEA receipt hid most cards). It now scrolls with touch, trackpad, Shift + mouse wheel and the arrow keys, and pointer devices get a thin scrollbar plus prev/next arrows; a soft fade marks the side with more cards. (2) The desktop side panel is 50% wider: 576px instead of 384px (the code asked for 520px, but the sheet's default `sm:max-w-sm` capped it at 384px). It is never wider than the window minus 2rem. The demo receipt panel on Search matches. The mobile bottom sheet is unchanged. Branch `skip-junk`.
