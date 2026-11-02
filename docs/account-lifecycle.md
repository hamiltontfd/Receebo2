# Account lifecycle: trial limits, frozen accounts and data deletion

Status: implemented in dev (session 16, 27 Oct 2026), **not published**. Legal wording in the app is marked **[LEGAL REVIEW NEEDED]**. Decisions by Hamilton are quoted where they apply.

## 1. Trial limits (no-card trial)
- 15 days, up to **5 saved receipts** (uploads and approved Outlook imports share the cap).
- A receipt counts **only once the user saves it after review** (`trial_uploads.state = succeeded`). Upload/scan attempts, non-receipts, failed reads and discarded drafts never count. An extracted draft holds its slot for 24 h (`extracted`), then stops holding it; saving it later is refused if the cap was reached meanwhile.
- **10 AI reads per trial** (`trial_ai_reads`), saved or discarded, shared by uploads and email imports. At the cap: upload URL refused with "You've used the 10 free receipt reads in your trial. Subscribe to add more."; email sync stops before any AI call. Paid, owner and legacy Stripe-trial accounts are not capped.
- Email import only sends **clear purchase emails** to the AI: grocery, food delivery, transport, utility, telecom and insurance senders (Continente, Pingo Doce, EDP, MEO, Uber…) and utility-bill subjects are skipped before any AI read (`lib/mailProviders/merchants.ts`). Candidates are ranked (durable stores > ticket sellers > marketplaces > others) so the read budget goes to likely warranty/return items. Bills use the **issue date**, never the due date; an email-import date later than the email itself is clamped to the received date.

## 2. Frozen (paused) accounts
- **When:** the trial ends unpaid (`trial_expired`) or a paid plan lapses (`subscription_required`). Owners and active/past-due-within-period plans are never frozen.
- **What stops:** new receipts, email imports, warranty/return reminders (email and push go only to users with access), and app access except Settings/profile/billing/deletion.
- **Export:** self-serve in Settings **only while the account has access**. Once frozen there is no in-app export (`GET /api/account/export` returns 403 `account_frozen`); Settings and the paywall say to email **contact@receebo.net** for a copy. Decision: "Sim pelo email depois de congelada".
- **Deletion date** is shown on the paywall (`dataDeletionAt` in `GET /api/billing/subscription`).

## 3. Deletion after 60 days
- Due **60 days after access ended** (trial end, or the end of the last paid period). Accounts already frozen when this shipped get at least 30 days from the first time they were seen frozen, so everyone receives both warnings.
- **Deleted:** Clerk sign-in account, receipts, files (receipts, attachments, pending imports), extracted data, Outlook/Gmail connections, preferences, push subscriptions, trial and billing rows. **Kept:** invoice/payment records that Stripe must keep by law. No Stripe API call is made by the automatic deletion.
- **Subscribing before the date cancels the deletion** (the `account_lifecycle` row is removed on the next sweep; nothing is deleted while access exists).
- **Emails** (Resend, `Receebo <hello@receebo.net>`, reply-to contact@receebo.net, strictly transactional, footer `[ADDRESS]`): warning 30 days before, final warning 7 days before (exact date in subject/heading), confirmation after deletion. The same confirmation template is used after a user-requested deletion. If the 7-day warning was never sent (e.g. the flag was off), the date moves 7 days out and the final warning goes first; deletion requires the final warning to be at least 6 days old.
- **Safety switch:** runs only when `DATA_DELETION_ENABLED=true`. **Default off**: the daily sweep records each frozen account's schedule and logs a **dry run** ("would send warning", "would delete account" with receipt/file/connection counts), sending nothing and deleting nothing.
- Daily, inside the existing daily maintenance (DB lock, at most once per ~23 h): `lib/accountLifecycle.ts` → `runDataRetentionSweep()`.

## 4. User-requested deletion
Settings → Delete account → in-app warning → a **6-digit code** is emailed (expires in 15 minutes, single use, 5 attempts) → the user types it → deletion → confirmation email. The code is never in the subject or preheader. Copy is a placeholder (marketing owns it).
- API: `POST /api/account/deletion-code` emails the code (202 `{sentTo, expiresAt}`; 429 with `Retry-After` after a send in the last 60 s or 5 sends in an hour; 502 if Resend refuses, and that code is voided). `DELETE /api/account` takes `{confirmation: "DELETE", code}`; wrong codes return 400 `deletion_code_invalid` with `attemptsLeft`, then `deletion_code_too_many_attempts`, `deletion_code_expired` or `deletion_code_missing`.
- Storage: `account_deletion_codes` keeps only an HMAC of the code (keyed with `SESSION_SECRET`), the expiry, the attempt count and the send counters. A deletion that already started (code verified) and failed part-way can be retried without a new code.
- Email: `renderDeletionCodeEmail` in `emailService.ts`, subject "Confirm your Receebo account deletion", no code in the subject or preheader, no delete link. Copy: PLACEHOLDER from `deletion-code.txt`.

## 5. Open for Hamilton
- Postal address for the email footer (`[ADDRESS]`).
- Confirm the final warning timing (7 days before deletion).
- Legal review of the terms/privacy clauses marked [LEGAL REVIEW NEEDED], and whether to bump `TERMS_VERSION`/`PRIVACY_VERSION` (forces re-acceptance).
- When to set `DATA_DELETION_ENABLED=true` in production.
- Whether payment failure gets a grace period before the freeze (today access follows Stripe: past-due keeps access until the period ends).

## Lifecycle emails v2 (branch lifecycle-emails-v2, 2 Nov 2026, not published)
Marketing copy (/workspace/receebo/lifecycle-emails.md) on top of the sweep above. Code: `lib/lifecycleEmails.ts` (send), `lib/lifecycleEmailCopy.ts` (copy, en / pt-PT / pt-BR), `lib/lifecycleEmailStore.ts` (tables, report numbers), `lib/feedbackToken.ts`, `lib/feedbackPages.ts`, `routes/feedback.ts`.
- Emails: `trial_ended` (new; unpaid no-card trial, once, up to 3 days late), `deletion_warning_30d` / `deletion_warning_7d` (replace the placeholder warnings; the sweep's claim/rollback is unchanged), `account_deleted` (inactive and requested).
- Language: account language (`user_preferences.language`); none -> English. pt-PT accounts get pt-PT copy (2 Nov brief; supersedes the earlier "pt-PT gets pt-BR"). English dates are en-US for US-market accounts. Language, date format, name, address and receipt count are captured BEFORE deletion.
- Same safety switch: nothing is sent unless `DATA_DELETION_ENABLED=true` (trial_ended included, its copy announces the deletion date).
- Copies while paused: still by email (`mailto:contact@receebo.net`), no in-app export; the copy says "ask us for a copy".
- Smile rating: signed link (HMAC, 30 days, `FEEDBACK_TOKEN_SECRET`; without it in production the email goes without smiles). GET page writes nothing (scanners); JS POSTs after ~300 ms, `<noscript>` button. Last click wins, `click_count`, optional comment (1000 chars, rate limited). Token redacted from request logs.
- Tables (additive, startup): `email_sends(id, user_id, email_type, idempotency_key unique, deletion_date, locale, sent_at, resend_id, created_at)`, `email_feedback(id, user_id null, email_type, email_send_id null, rating good|ok|bad, locale, comment null <=1000, click_count, created_at, updated_at)`, unique (user_id, email_type, email_send_id).
- Account deletion (same transaction): email_feedback -> user_id, email_send_id and comment set to NULL (rating, type, locale, dates kept); email_sends rows deleted. The post-deletion `account_deleted` send writes no row (Resend idempotency key only).
- Privacy policy: new line in section 6 (EN). pt-PT / pt-BR versions (the policy page is English only) are on the rating thanks page:
  - pt-PT: "Se avaliou a sua experiência com o Receebo, guardamos essa avaliação de forma anónima depois de a sua conta ser eliminada, sem qualquer ligação a si ou ao seu email."
  - pt-BR: "Se você avaliou sua experiência com o Receebo, guardamos essa avaliação de forma anônima depois que sua conta é excluída, sem nenhum vínculo com você ou seu e-mail."
  - No PRIVACY_VERSION bump (Hamilton to decide).
- Read ratings: `SELECT email_type, rating, locale, count(*) FROM email_feedback GROUP BY 1,2,3`.
