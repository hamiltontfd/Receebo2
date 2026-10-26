# Email sending (Resend)

All email goes through `artifacts/api-server/src/lib/emailService.ts`.

## Configuration

| Env var | Purpose | Default |
| --- | --- | --- |
| `RESEND_API_KEY` | Resend API key (Replit Secret). | none: sends fail and are logged |
| `RESEND_FROM` | Sender, e.g. `Receebo <hello@receebo.net>`. | `onboarding@resend.dev` (Resend test sender) |
| `RESEND_REPLY_TO` | Optional Reply-To. Unset means no Reply-To header. | unset |
| `SESSION_SECRET` | Signs unsubscribe tokens. | required for reminder emails |

- `.replit` no longer sets `RESEND_FROM`; the code default is the same value, so behaviour did not change.
- Links in emails use `appUrl()`: `https://receebo.net` in production, the workspace dev domain in development.
- **The test sender only delivers to the Resend account owner's own address.** Until the steps below are done, other users get nothing. Every rejection is now logged as `Email rejected by Resend` with `errorName`/`errorMessage`, and the reminder flags are reset so the next daily run retries.

## Emails that exist today

| Email | Trigger | Who gets it |
| --- | --- | --- |
| Warranty reminder | Daily sweep, once per expiry date, 28-30 days before it | Users with current access (active trial incl. at the 5-receipt cap, paid, legacy Stripe trial, owner) who did not opt out |
| Return-window reminder | Daily sweep, 7 and 2 days before the deadline (only the 2-day one if both are due) | Same as above |
| Legacy Stripe-trial ending | Stripe `trial_will_end` webhook + daily sweep | Old Stripe subscriptions still in a Stripe trial only |
| Payment failed | Stripe failed-renewal webhook | Paid subscribers |

The per-receipt "receipt ready" email was removed (26 Oct 2026): bulk imports would spam users.

Warranty and return reminders carry `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) and a footer link. `POST /api/notifications/unsubscribe?token=…` unsubscribes; `GET` only shows a confirmation button, so link scanners (e.g. Outlook Safe Links) can't unsubscribe anyone.

New templates should use `renderEmailLayout({ eyebrow, bodyHtml, cta, footerHtml, unsubscribeUrl })`, `escapeHtml()` for any user/AI text, and `deliver()` so errors are handled the same way.

The daily sweep (orphan files + reminders) checks hourly and runs at most once per 23 h across restarts and instances (`scheduled_job_runs` row `daily-maintenance`).

## Switching to a receebo.net sender (do in this order)

DNS for receebo.net is at **Name.com** (registrar Name.com; nameservers `ns*.name.com`). Inbound mail is Zoho (MX `mx.zoho.eu` etc.), SPF `v=spf1 include:zohomail.eu ~all`, DMARC `p=reject`.

1. In Resend: **Domains → Add domain → `receebo.net`**, region EU (Ireland) is fine.
2. Resend shows the DNS records. Typically:
   - TXT `resend._domainkey` → the DKIM key Resend gives you.
   - MX `send` → `feedback-smtp.<region>.amazonses.com`, priority 10.
   - TXT `send` → `v=spf1 include:amazonses.com ~all`.
   Copy the exact values from Resend, not from here.
3. In Name.com: **My Domains → receebo.net → Manage DNS Records**, add exactly those records. **Do not touch the existing Zoho MX, the root SPF TXT or `_dmarc`.** The Resend records live on `send.` and `resend._domainkey`, so they don't conflict with Zoho.
4. Wait until Resend shows the domain as **Verified** (minutes to a few hours).
5. Send a test to a non-owner address from the Resend dashboard and check it arrives with DKIM=pass (Gmail "Show original").
6. Make sure the sender mailbox can receive replies, or set a Reply-To you read (e.g. a Zoho mailbox).
7. In Replit, **Secrets** (workspace and deployment): set `RESEND_FROM` = `Receebo <hello@receebo.net>` and, optionally, `RESEND_REPLY_TO` = your Zoho address.
8. Restart the API in dev, trigger a reminder (or wait for the daily run) and check the logs for `Email accepted by Resend`.
9. Publish. Then watch Resend **Logs** for bounces/complaints during the first days.

Because DMARC is `p=reject`, setting `RESEND_FROM` to an `@receebo.net` address **before** step 4 would get every email rejected. Keep the default until the domain is verified.
