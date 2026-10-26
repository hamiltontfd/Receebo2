# Receebo: hackathon log (SpaceXAI Digital Transformation LAB, Braga)

Timeline of work on Receebo using Cursor + Grok Bot, kept for the Taikai submission. One entry per session: goal, what was done (and by whom), files touched, outcome.
Technical details live in `docs/assistant-log.md`.

---

## 26 Oct 2026, session 1: connecting Cursor + Grok Bot to Replit
**Goal:** Keep Receebo hosted on Replit while editing it with Cursor and an AI assistant (Grok Bot).

**What was done**
- Grok Bot generated an SSH key on Hamilton's Mac and configured `~/.ssh/config` (with a `receebo` shortcut).
- Grok Bot signed in to Replit in its own browser (Hamilton logged in) and added the key to the Replit account.
- Grok Bot tested the SSH connection (read + write) and opened the Replit workspace in Cursor via Remote-SSH.
- Diagnosed a Cursor warning (terminal sandbox / AppArmor): harmless, caused by Replit container limits.

**Outcome:** Cursor edits the live Replit workspace directly; Replit remains host and source of truth.

## 26 Oct 2026, session 2: codebase review
**Goal:** Understand what Receebo does and what's left before launch.

**What was done:** Grok Bot did a read-only review of the code and docs over SSH and summarized features, stack, pricing and launch blockers.

**Outcome:** Overview and launch to-do list recorded in `docs/assistant-log.md`.

## 26 Oct 2026, session 3: documentation approach
**Goal:** Keep a record of all work for the hackathon.

**Decision:** Use two files in the repo (`docs/assistant-log.md` technical, `docs/hackathon-log.md` timeline) instead of a Cursor cloud Project, keeping everything on Replit during the ~1-month trial.

**Files touched:** `docs/assistant-log.md` (new), `docs/hackathon-log.md` (new).

## 26 Oct 2026, session 4: critical business review
**Goal:** Honest assessment of whether Receebo works as a B2C subscription at EUR 2.99/month (EUR 24.99/year).

**What was done:** Grok Bot researched competitors (e-Fatura, StuffWatch, ReturnGuard, Clockwork, Slipcrate), PT/EU consumer law, subscription-app benchmarks (RevenueCat 2025), Gmail restricted-scope verification costs, and AI cost per receipt; cross-checked against the code.

**Findings:** Weak as pure B2C subscription: reminder rarely triggers (14-day right applies to online purchases only), 7-day/3-receipt trial ends before value appears, free alternatives exist, thin LTV, yearly Gmail CASA cost. Strengths: accurate PT/EU legal logic (3-year warranty), cheap AI extraction, polished product. Bug: 14-day window counted from purchase date instead of delivery date.

**Recommendations:** Free tier instead of trial; annual/lifetime pricing; email forwarding instead of Gmail OAuth. Pivot options: PT/EU warranty vault, freelancer expense/IRS companion to e-Fatura, B2B2C via banks/insurers/retailers (preferred for the hackathon pitch).

## 26 Oct 2026, session 5: founder problem statement
**Founder insight (Hamilton):** Buys a lot online across several inboxes (Gmail for subscriptions, Outlook for Amazon and e-commerce). When a warranty needs action, the hard part is finding where something was bought and which email was used. Doesn't keep paper receipts. Recently missed an Amazon return window for tools.

**Reframe:** The core problem is retrieving proof of purchase across scattered inboxes and paper, not return reminders. Proposed positioning: every purchase from every inbox in one place, findable in seconds when something breaks; return reminders become a secondary feature.

**Gaps found:** Receebo only imports from Gmail; the founder's own e-commerce mail is in Outlook. Idea: a per-user forwarding address (works with any provider, avoids Google CASA) plus a historical backfill for old warranties.

**Next step:** Validate with 10-15 people at the hackathon: how did you find proof of purchase last time, and have you lost a warranty or return because of it?

## 26 Oct 2026, session 6: which email sources to support
**Question:** Beyond Gmail, which providers make Receebo the single source of truth for receipts?

**Recommendation (Grok Bot):** (1) Outlook/Hotmail/Live via Microsoft Graph read-only mail (second-largest provider; covers the founder's own e-commerce inbox; no Google-style yearly paid assessment as far as known, publisher verification recommended). (2) Per-user forwarding address (e.g. you@in.receebo.net) as the universal channel for iCloud, Yahoo, SAPO, GMX, work mail. (3) Skip direct iCloud/Yahoo/regional integrations for now (iCloud = IMAP + app-specific passwords; Yahoo mail access needs approval). Also consider Amazon order-history file import.

**Decision pending:** Build Outlook + forwarding address next; lead the pitch with the forwarding address.

## 26 Oct 2026, session 7: forwarding rejected as the main channel
**Founder feedback:** Forwarding is too much effort; he would not do it himself.

**Revised direction:** Lead with "connect your inboxes once, Receebo finds everything" (direct, auto-syncing connections). Priority: (1) keep Gmail and fund Google verification/CASA once demand is validated; (2) build Outlook/Microsoft next; (3) forwarding address only as a low-key fallback for edge cases (iCloud, work mail), not part of the pitch.

## 26 Oct 2026, session 8: Gmail integration cost review
**Question:** Founder never agreed to pay for Google; how is Gmail set up today?

**Findings (read-only code review):** Own OAuth client in Google Cloud project `receebo`; scopes `gmail.readonly` (restricted) + `userinfo.email`; tokens AES-256-GCM encrypted; sync every 4h + manual, last 90 days, PDFs matching receipt/order/invoice/confirmation, max 100 per run. Status: Testing mode, 1 test user, never submitted for verification. Nothing paid or auto-charged. Public launch would require Google verification + yearly CASA by a paid third-party assessor (approx. USD 675-1,800/yr; free self-scan ended 2024).

**Bug found:** Testing-mode consent expires after 7 days and sync fails silently.

**Recommendation:** Stay in Testing for the hackathon (free, up to 100 testers) and add a reconnect prompt; build Outlook next (verify Microsoft requirements first); pay for CASA only after validating demand.

## 26 Oct 2026, session 9: Outlook instead of Gmail
**Context:** Founder considers dropping Gmail import because Google's yearly CASA assessment is too expensive.

**Findings:** Microsoft has no mandatory paid assessment; publisher verification is free (Partner Program account, work-account tenant, verified domain). Mail.Read works for personal and work accounts; refresh tokens last 90 days and renew on use (no 7-day expiry). Some organisations block unverified apps. Gap: the importer only reads PDF attachments, but Amazon-style order emails are HTML, so body parsing is needed.

**Plan:** Provider abstraction (Gmail + Outlook), `email_connections` table, reconnect prompt, Gmail hidden via feature flag instead of deleted. Estimated 6-9 dev-days. Full details in `docs/outlook-integration-plan.md`.

## 26 Oct 2026, session 10: Outlook import built, Gmail hidden
**Goal (Hamilton):** "Let's proceed with the plan, intro the MS fetching and hiding gmails": build Outlook import and stop showing Gmail, without deleting it.

**What Grok Bot did:** Implemented `docs/outlook-integration-plan.md` directly in the Replit workspace over SSH. Added a mail provider abstraction with one shared import pipeline for Gmail and Outlook. Built Outlook import on Microsoft Graph (sign-in with Microsoft, read-only `Mail.Read`, last 90 days, PDF attachments, encrypted and rotated tokens, throttling retries). Added HTML-body receipts so order emails without a PDF (like Amazon) go through the AI extraction and land in the same review queue, saved as a generated PDF. Added a `needs_reconnect` status with Reconnect banners in Settings and the pending imports list. Hid Gmail behind the `MAIL_PROVIDERS_ENABLED` flag (default `outlook`); Gmail code and data are kept and disconnect still works. Added tests and updated the docs.

**Files touched:** API `artifacts/api-server/src/lib/{mailSync,outlookGraph,outlookSync,oauthState,textPdf}.ts`, `lib/mailProviders/{types,config,candidates}.ts`, `lib/{gmailSync,receiptExtraction,tokenCrypto,logger}.ts`, `routes/{outlook,mail,gmail,account,index}.ts`, `src/index.ts`; DB `lib/db/src/schema/{emailConnections,gmailConnections,index}.ts`; web `artifacts/receiptr/src/{lib/mailConnection.ts,lib/gmailConnection.ts,components/MailConnections.tsx,components/PendingImports.tsx,pages/settings.tsx}`; tests for each new module; docs.

**Outcome:** Commits `3c8cede` (API + DB) and `7cb9c42` (web) on `main`, not pushed or published. Typecheck clean; API tests 194 passed, 2 skipped (was 140); web tests 164 passed (was 152). Outlook stays hidden until the Microsoft app is registered and `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` are added to Replit Secrets; then test on the dev URL and publish. Not yet tested against a real Outlook account.
