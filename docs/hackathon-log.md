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

## 26 Oct 2026, session 11: website and app copy switched to Outlook
**Goal (Hamilton):** "We need to revise the website and the app interface to reflect the changes, hiding gmail integration and adding the outlook one."

**What Grok Bot did:** Searched every user-facing "Gmail/Google" mention (landing, FAQ, meta tags, sign-up and consent screens, Settings data/delete copy, privacy policy, terms, Expo mobile app). Added a public `GET /api/mail/providers` endpoint (enabled + configured providers, no user data) so the website names whichever inbox is actually connectable: "Outlook" by default, "Gmail or Outlook" if Gmail is re-enabled, plain "your inbox" if nothing is configured yet. Rewrote the landing email section (the Gmail screenshot is replaced by a coded illustration), FAQ answers, hero/demo/feature bullets and meta description (forwarding no longer promoted). Rewrote the privacy policy and terms for Microsoft Graph (Mail.Read, offline_access, User.Read, openid, email; last 90 days; PDFs and order-email bodies; encrypted tokens; disconnect any time; not sold or used for ads) with a short note for earlier Gmail connections. Mobile app: the Settings "Gmail import" card is now an "Email import" section driven by `/mail/status` (Connect / Reconnect / Disconnect per provider, so Outlook appears and Gmail is hidden by the same flag); pending badge and empty states made provider-neutral. Added tests.

**Files touched:** API `routes/mail.ts`, `routes/mailProviders.test.ts`; web `index.html`, `src/App.tsx`, `src/lib/availableMailProviders.ts` (+test), `src/components/{LegalConsentGate,PrivacyAndDataSettings}.tsx`, `src/pages/{privacy,terms,search}.tsx`, `src/pages/landing/{EmailReceiptsSection,FAQSection,HeroSection,DemoSection,WhyReceeboSection}.tsx`, `src/pages/landing/InboxCopy.test.tsx`; mobile `hooks/useGmail.ts`, `app/(tabs)/{settings,_layout,imports,index}.tsx`, `components/LegalConsentGate.tsx`.

**Outcome:** Commit `00057db` on `main`, not pushed or published. Typecheck clean (all 5 projects incl. mobile); web tests 172 passed; API tests 195 passed, 2 skipped. Production build checked: the only "Gmail" strings left are the provider label map and the legacy-Gmail sentences in the legal pages. Open for Hamilton: whether to bump the legal version (forces re-acceptance) and the "Effective" date; legal review of the new privacy text.

## 26 Oct 2026, session 12: free trial becomes 15 days + 5 receipts
**Goal (Hamilton):** New free-trial rule: every new account gets 15 days, no card, and can add up to 5 receipts (uploads and approved email imports share the cap). After the 5th receipt the user can still view, search, open files, export and get warranty/return alerts until day 15; on day 15 the existing paywall (€2.99/€24.99) appears. Plus a one-line notice with a Subscribe button once the 5 receipts are used.

**What Grok Bot did:** `TRIAL_LIMIT` 3 → 5 and trial length 7 → 15 days (`api-server/src/lib/accountTrial.ts`). "Can view" and "can add" are now separate: `trial_exhausted` keeps `canUseApp=true` with `canUpload=false`, so only expiry shows the paywall. Every add path refuses a 6th receipt with the exact message "You've used your 5 free receipts. Subscribe to add more." (upload URL, `POST /receipts`, manual acceptance of a failed extraction, email-import approve, guest claim). Mail sync already skips accounts that can't add, so no AI runs at the cap. Extra pages for an existing receipt are still allowed (not a new receipt, no AI). Web: one-line amber notice + Subscribe on every app page at the cap; scan page, upload toasts and pending-import approvals show the same message with Subscribe (goes to `/settings#upgrade-plans`, the existing Stripe Checkout plans). Strings live in `receiptr/src/lib/trialCopy.ts` with pt-PT/pt-BR in a comment. Copy updated to "15 days free, no card. Add up to 5 receipts." on get-started, hero, pricing, final CTA, FAQ, terms and Settings/Profile.

**Existing users:** an idempotent startup migration sets `ends_at = started_at + 15 days` for every account trial shorter than that, so everyone gets 15 days from their original start. Side effect (intended): 7-day trials that ended less than 15 days after they started are reopened until day 15. Receipts already used still count; the cap rises from 3 to 5. Paid, owner and legacy Stripe-trial users are untouched.

**Alerts:** confirmed warranty and return-window sweeps have no plan/trial check (only the email opt-out), so they keep running at the cap. New test runs the return-window sweep for a capped trial and sees email + push.

**Outcome:** Commit `7c23732` on `main`, not pushed or published; no Stripe calls. Typecheck clean (5 projects); web tests 178 passed (25 files); API tests 199 passed, 2 skipped. `test:marketing` can't run here (Playwright browsers not installed). Open: decide whether the terms change needs a `TERMS_VERSION` bump (forces re-acceptance); funnel event `third_receipt_succeeded` still fires at the 3rd receipt; translations not wired (app is English-only).

## 26 Oct 2026, session 13: email fixes, reminders only for users with access, Outlook-only copy
**Goal (Hamilton):** Fix the problems from the Resend audit ("em que pé estão os envios de email pelo resend?"), without decisions still pending. Added during the session: drop the "receipt ready" email, send reminders only to users with current access, and state clearly that email import is Outlook only for now.

**DNS:** receebo.net is registered at Name.com and its DNS is hosted there (nameservers `ns*.name.com`). Mail is Zoho (MX `mx.zoho.eu`), SPF only includes Zoho, DMARC `p=reject`. Resend records are not set up yet.

**What Grok Bot did:**
- **Links:** email links go to `https://receebo.net` in production (same rule as billing). The old `receebo.replit.app` returned 404.
- **Error handling:** every Resend send now checks the returned error, logs `errorName`/`errorMessage` and returns false. Warranty, return and trial flags are reset, so the next daily run retries.
- **Safety:** AI/user text is escaped in the email HTML. Subjects have control characters removed and are capped at 120 characters.
- **Sender:** one config, `RESEND_FROM`, still defaulting to `onboarding@resend.dev`, plus optional `RESEND_REPLY_TO`. `RESEND_FROM` was removed from `.replit` because it had the same value as the code default. The switch steps are in `docs/email-sending.md`.
- **Layout:** a shared `renderEmailLayout()` wrapper with the same design, ready for the lifecycle emails.
- **Receipt ready:** the "receipt ready" email per receipt is removed.
- **Warranty reminders:** deduplicated per expiry date (new column `receipts.warranty_reminder_sent_for`), sent 28–30 days before expiry, awaited and counted, with an unsubscribe link.
- **Return reminders:** if the 7-day and 2-day reminders are both due, only the 2-day one is sent.
- **Who gets reminders:** warranty and return reminders (email and push) go only to users with current access: an active trial (including at the 5-receipt cap), a paid plan, a legacy Stripe trial, or the owner.
- **Daily job:** the server checks hourly, and a database lock (`scheduled_job_runs`) means the daily job runs at most once every 23 hours across restarts. Each sweep runs independently, so one failure doesn't stop the others.
- **Unsubscribe:** one-click `List-Unsubscribe` + `List-Unsubscribe-Post`. Opening the link only shows a confirm button, so link scanners can't unsubscribe anyone.
- **Formatting:** money and dates are en-GB ("€12.50", "26 Oct 2026").
- **Site meta tags:** `VITE_APP_URL` now defaults to `https://receebo.net` (vite config + `.env.production`). A production build has no `%VITE_APP_URL%` left.
- **Copy:** the Settings reminder label now covers warranty and return reminders. The privacy text no longer mentions receipt-processing emails and says reminders are sent while you have access.
- **Outlook-only copy:** shown when Outlook is the only provider. Landing title "Import from Outlook" with the agreed body, a new FAQ item "Which email providers work?", and a note next to Connect Outlook (web + mobile). The multi-provider and neutral wording stays as before.

**Outcome:** Commit `ec6b20d` on `main`, not pushed or published. No Stripe or Resend calls. The migration was applied to the dev DB. Typecheck clean (5 projects); web tests 181 passed; API tests 218 passed, 2 skipped.

**Open:**
- Verify receebo.net in Resend, then set `RESEND_FROM` (steps in `docs/email-sending.md`). Until then only the Resend account owner gets email.
- The privacy text changed again: decide on the legal version bump together with the earlier changes.
- Legacy Gmail notes kept in privacy (section on earlier Gmail connections) and terms (Google listed as a provider "for earlier Gmail connections"), while old Gmail tokens may still exist in production.
- Lifecycle emails (welcome, trial start/end, deletion after 60 days) not started.

## 2026-10-26 — Session 14: Resend set up from scratch (Receebo Engineer)
- Goal: real email delivery from receebo.net.
- Done: removed old failed Resend domain kintrat.replit.app (Hamilton's request); added receebo.net in Resend (EU); added DKIM/SPF/MX/CNAME records in Replit Domains (DNS for Replit-bought domains); domain verified. Created send-only API key "Receebo production" restricted to receebo.net and stored it in Replit Secrets as RESEND_API_KEY (value never shown). Set RESEND_FROM="Receebo <hello@receebo.net>" and RESEND_REPLY_TO=contact@receebo.net in .replit (commit c1c3083). Test email from hello@receebo.net delivered.
- Files: .replit
- Outcome: ready once Hamilton publishes; old keys "Receiptr"/"Onboarding" to delete after production sends are confirmed.

## 2026-10-26 — Session 15: P1 copy for the demo + Outlook dev connection test (Receebo Engineer)
- Goal: P1 items approved by Hamilton ("vamos executar") before the 27 Oct presentation, plus a live Outlook test in dev.
- Outlook (dev): Microsoft Entra app "Receebo" registered (Default Directory, personal + work accounts, delegated Mail.Read/User.Read/email/offline_access/openid); MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET saved in Replit Secrets (values never shown). API restarted; Hamilton's Hotmail connected in dev; first sync imported 9 receipts: most were supermarket (5x Continente), plus EDP Comercial, Everything is New, See Tickets, Ticketline. The EDP bill was dated 27 Oct (tomorrow), probably the due date read as the purchase date. Both follow-ups are P2.
- P1 commits (copy only, no design changes):
  - 346a7ea Hero subtitle: "Scan or import from Outlook. Find any purchase in seconds. Never miss a return or warranty date."
  - d2ca5c8 Line under the hero CTA: "15 days free, up to 5 receipts." (button still says "Start free, no card needed").
  - 3a6e796 Footer line on landing + legal pages: "Alternative dispute resolution: TRIAVE (see Terms)" / PT "Resolução alternativa de litígios: TRIAVE, ver Termos" (PT ready, site is English-only today).
  - f7409df Social preview: og/twitter descriptions match the new subtitle; og:image size fixed to the real 1280x720; added og:site_name and og:image:alt.
  - b8c36d6 Trial analytics: new receipt_limit_reached event at the 5th successful receipt (DB trigger, once per account); plan_selected now recorded only after checkout config is valid. Dev DB check constraint widened by the startup migration.
- Tests: web 184 passed; API 219 passed, 2 skipped.
- Outcome: on main in Replit, not pushed or published. Stripe untouched.

## 2026-10-27 — Session 16: P2 (Grok Bot, Hamilton: "Pode começar o P2 agora, não vou publicar antes")
- Goal: P2 items from the dev Outlook test and the account lifecycle plan. One commit per item on main; not pushed or published; Stripe untouched; no secrets shown.
- Commits:
  - fdc56ea Outlook/email import: trial capped at 10 AI reads; grocery/utility senders (Continente, EDP…) skipped before the AI and filtered after it; only clear purchases imported; bills use the issue date, never the due date (date clamped to the email date).
  - 025907e Trial: an upload counts toward the 5 receipts only once saved; unsaved drafts held 24 h then released; old unsaved drafts uncounted by a startup migration.
  - 51b4e94 Accounts: frozen at trial end or plan lapse; deleted 60 days later (except billing records Stripe must keep); subscribing cancels it; 30- and 7-day warnings plus a confirmation email (placeholder copy, [ADDRESS] footer); in-app export only while the account has access, otherwise by email to contact@receebo.net. Deletion only runs with DATA_DELETION_ENABLED=true (default off: dry-run log, no emails). Spec in docs/account-lifecycle.md; terms/privacy marked [LEGAL REVIEW NEEDED].
  - a478b49 Account deletion confirmed with a 6-digit emailed code (hashed, 15 min, single use, 5 attempts, rate limited); placeholder copy from deletion-code.txt; web dialog; terms/privacy wording marked.
  - 3948660 Returns: the window counts from the delivery date when known, else the purchase date (new receipts.delivery_date, AI extraction, editable "Delivered on" field, API spec).
  - 6ad9f5b Locales: en/pt-PT/pt-BR scaffolding; Brazil CDC panel (legal deadline from delivery and manufacturer warranty side by side, never added); US structure only; per-market legal document placeholders. Notes in docs/locales-and-rights.md.
- Dev DB: new tables trial_ai_reads, account_lifecycle, account_deletion_codes and column receipts.delivery_date (startup migrations).
- Tests: typecheck clean (5 projects); web 204 passed; API 263 passed, 2 skipped.
- Outcome: on main in Replit, not pushed or published.
- Open for Hamilton: postal address for [ADDRESS]; confirm the 7-day final warning; legal review of the [LEGAL REVIEW NEEDED] clauses and the terms/privacy version bump; when to set DATA_DELETION_ENABLED=true in production; grace period after a failed payment; "paused", welcome and trial-ending emails not built; BR/US legal texts and full app translation not started.

## 2026-10-27 — Session 17: promo video on the landing page (Grok Bot, Hamilton: "Yes, but make it a muted autoplay loop")
- Goal: add the 30 s marketing promo right under the hero as a muted autoplay loop; hero and CTA unchanged.
- Media (artifacts/receiptr/public/media): re-encoded from the 1920x1080 master and the 9:16 cut. 16:9 1280x720 MP4 2.26 MB / WebM (VP9+Opus) 1.72 MB; 9:16 720x1280 MP4 2.63 MB / WebM 2.05 MB; WebP posters (warranty side-by-side frame) 26 KB / 38 KB. Audio kept for the sound toggle. Captions are burned into the video, so no text track.
- Component: src/pages/landing/PromoVideoSection.tsx. One muted, looping, inline video (preload=metadata, poster, aria-label "Receebo in 30 seconds"); 9:16 below 768 px and 16:9 from 768 px up, picked by matchMedia so only one file downloads; aspect ratio reserved (no layout shift); plays only while on screen (IntersectionObserver); pause and sound on/off buttons with aria-labels; with prefers-reduced-motion it never autoplays and shows the poster with a play button.
- Tests: typecheck clean; web 208 passed (4 new). Dev URL serves all six files with 206 range responses and the right content types; headless Chrome confirmed only the matching cut loads on desktop and mobile.
- Outcome: on main in Replit, not pushed or published.

## 2026-10-27 — Session 18: alert fixes, block A (Grok Bot, Hamilton: "Começa já, e eu não publico até ele avisar que terminou o bloco A")
- Goal: verify the CEO agent's alert review against main (b20ab09) and fix block A. One commit per item on main; not pushed or published; Stripe untouched; no secrets shown. Plan and the notifications proposal (block B, not built) in /workspace/receebo/plan-alerts-notifications.md on the agents' computer.
- Review: all nine findings confirmed on current main; P2 hadn't touched any of them (it only moved the return window to the delivery date).
- Commits:
  - d9633b1 A1 Warranty reminders: legal (PT 3y / EU 2y) and manufacturer end dates now computed on the server (lib/warrantyExpiry.ts, parses "2-year manufacturer warranty", "Garantia de 12 meses"…), stored in receipts.legal_/manufacturer_warranty_expires_on (startup migration + backfill by rules version, refreshed after extraction and edits); the sweep uses them, each with its own dedup.
  - a68fe7a Receipts list (Hamilton's request): colored category pill next to the date removed from the Recent and search rows; the colored icon stays. Detail page, "Worth keeping" cards and filter chips unchanged.
  - 5b0d607 A5 Warranty reminder when the end date is 0-30 days away (was 28-30), once per date.
  - 539220c A3 Other EU/EEA countries (DE, ES, FR, NO…) get the EU rules on web and server.
  - fc37662 A4 Unknown purchase channel is no longer treated as online at known retailers: no deadline or reminder, a store-policy note instead.
  - 4f4dadd A6 Warranty reminders by push too, with their own dedup columns.
  - f09f5bb A7 Legal warranty counts from delivery when known (DL 84/2021); second-hand comment fixed (18 months by agreement).
  - ca17815 A8 29 Feb and month-end dates clamp to the last day of the month.
  - 8b459ec A9 Re-arm return reminders on channel/store/currency edits; drafts skipped by the warranty sweep; "closes today"; the 1-day push also marks the 2-day one.
  - c17958b A2 POST /api/internal/cron/daily-maintenance with x-cron-secret (CRON_SECRET env; 503 when unset) for an external cron or Scheduled Deployment. Deployment settings and the in-process tick unchanged.
- Dev DB: receipts gained legal_warranty_expires_on, manufacturer_warranty_expires_on, legal_warranty_reminder_sent_for, warranty_calc_version, legal_/manufacturer_warranty_push_sent_for (idempotent startup migration, also applied by the API test global setup).
- Tests: typecheck clean; web 215 passed; API 282 passed, 2 skipped.
- Not done: the running dev API was not restarted, so it still serves the old build until the next restart; the expiry backfill runs then. Mobile (Expo) list row left as is (plain grey category text, no colored icon).
- Open for Hamilton: create CRON_SECRET (dev + production) and a daily caller; Brazil CDC art. 26 reminders after legal review; expect a one-off batch of warranty reminders after publishing; approve the block B scope.

## 2026-10-27 — Session 19: landing media from the Casa Lumen demo story (Grok Bot, Hamilton: "Sim, regrava com a Casa Lumen")
- Goal: the landing, demo account, promo video and Taikai banner tell the same story, and no landing image shows the removed category pill. Not pushed or published; Stripe untouched; dev API not restarted.
- Commits:
  - 5155be3 Landing marketing media v2. The capture fixtures (scripts/marketing) now use the demo data: Casa Lumen Electrónica 55" 4K Smart TV €649 (23 Oct, in store, PT, 2-year manufacturer warranty), Casa & Jardim Braga €229, Mercado Verde €38.47 and Atelier Norte €59.90; capture clock 27 Oct 2026 12:00 UTC. Same framing as before. The Find clip searches "TV"; the Protect clip shows the 3-year legal warranty and the 2-year manufacturer warranty side by side. Fixtures map /api/mail/status and /api/mail/pending. The unused Gmail still and hero composites were dropped. marketing:check passed, the frames were reviewed, and approval was recorded. The media went create-only to App Storage marketing/receebo-real-app/v2/ (v1 untouched, so production keeps it until publish). MarketingMedia.tsx and upload.ts now point at v2; protection.webp is 686x360. Alt text, captions and demo descriptions were updated.
  - d7f8323 Promo video. It was rebuilt on the agents' computer from the demo-account screens (SKIP_TAG_MASK=1), with copy and timing unchanged. Re-encoded at the same names and sizes in public/media.
- Dev landing: pointed back at v1 during the upload, and switched to v2 only after every v2 URL returned 200 and matched byte for byte.
- Tests: typecheck clean; web 214 passed (the email-settings case was removed); marketing freshness 6/6.
- Notes: marketing:status lists MarketingMedia.tsx as changed since approval (the v1/v2 switch above). The promo's 22 s notification ("Return window closes in 3 days… Cordless vacuum… Return by 29 Oct") was not changed; the landing treats the vacuum as an in-store purchase.

## 2026-10-27 — Session 20: compact install bar (Grok Bot, Hamilton: "Faz assim direto no dev, sem publicar")
- Goal: replace the oversized "Add to Home Screen" panel, which on iPhone also covered the landing, with a one-line install bar. Not pushed or published; Stripe untouched.
- Commits:
  - 5216564 (Replit auto-checkpoint, taken mid-session) + 06cc84a. New InstallBar mounted only inside ProtectedShell: app icon, "Install Receebo on your phone" (pt-BR "Instale o Receebo no seu celular", pt-PT "Instale o Receebo no seu telemóvel" via the receebo:locale override), Install and X. Install uses the native beforeinstallprompt when available (captured from page load); otherwise a bottom sheet with 3 steps (iOS Safari with the Share icon drawn inline; other iOS browsers: open in Safari; others: browser menu > Install). Shown only when signed in, with at least one receipt, on a phone or with a native prompt, online, not standalone and not busy. X hides it for 30 days (localStorage receebo:installBarDismissedAt); hidden after appinstalled. The old PwaStatus install panel was removed. The mobile scan button moves up while the bar shows.
- Marketing media: unaffected. The capture harness renders AppShell directly and never mounts the bar. record.mjs also presets the dismiss key. v2 media were not regenerated; marketing:status lists the changed source files as usual.
- Tests: typecheck clean (all projects); web 218 passed (install tests moved to InstallBar.test.tsx); API 282 passed, 2 skipped; marketing freshness 6/6.
- Visual check on dev (390x844, iPhone Safari UA, demo account): bar on the receipts list, iOS sheet, and signed-out landing with no bar.
