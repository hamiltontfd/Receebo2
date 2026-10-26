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
- [ ] Update privacy policy/terms and landing/FAQ copy for Outlook (they still mention Gmail only).
- [ ] Publisher verification with Microsoft (free; Partner Program + DNS-verified receebo.net).
- [ ] Client secret expires (max 24 months): set a renewal reminder.

## Decisions
- 26 Oct 2026: Keep hosting on Replit; trial Cursor + Grok Bot for ~1 month via SSH. No Cursor cloud Project for now (would require a GitHub/Origin copy and two-way sync). Revisit at end of trial.

- 26 Oct 2026: Email import moves to Outlook (no yearly paid assessment). Gmail hidden with `MAIL_PROVIDERS_ENABLED` (default `outlook`), code and data kept so it can return if Google CASA becomes worth paying for.

- 26 Oct 2026: Critical business review done (see hackathon-log session 4). Leaning toward free tier + pivot exploration; no decision yet.
