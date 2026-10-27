# Daily cron: maintenance + Outlook sync

Production runs on an autoscale deployment, which scales to zero when idle, so in-process timers are unreliable. Once a day, an outside scheduler calls:

```
POST /api/internal/cron/daily-maintenance
x-cron-secret: <CRON_SECRET>
```

That one call does two things:

1. **Daily maintenance:** orphan cleanup, return and warranty reminders. Claimed in `scheduled_job_runs`, so it runs at most once every ~23 h.
2. **Outlook sweep:** every connected Outlook mailbox that isn't waiting for a reconnect and hasn't synced in the last 20 h, oldest first.
   - It starts new users only during the first 120 s; the rest are reported as `outlook.remaining`.
   - A cross-instance advisory lock prevents overlapping sweeps; a second call during a sweep gets `"busy"`.

Calling it again is safe. A second call the same day does nothing, apart from finishing any `remaining` users.

**Responses:**

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "ran": true\|false, "outlook": { "status": "ok\|busy\|inactive\|error", "due", "synced", "failed", "queued", "remaining" } }` | Call accepted |
| 401 | | Wrong or missing secret |
| 500 | | Daily maintenance itself failed (retry later) |
| 503 | | `CRON_SECRET` is not set |

Sync-on-connect and the Sync button in the app are unchanged. There is no 4 h timer and no post-start sweep any more.

## 1. CRON_SECRET

Generate a long random value, for example in the Replit Shell with `openssl rand -hex 32`. Don't paste it into chats or commits.

- **Dev:** Tools → Secrets → New Secret. Key `CRON_SECRET`, value = the random string. Then restart the dev API.
- **Production:** Publishing → your deployment → Secrets (deployment secrets) → add `CRON_SECRET`. Dev and production secrets are separate stores. Use a different value from dev if you like. Publish again so the deployment picks it up.

## 2. Scheduler: run at 06:00 Europe/Lisbon every day (cron `0 6 * * *`)

Lisbon is UTC+0 in winter (WET) and UTC+1 in summer (WEST, from the last Sunday of March to the last Sunday of October). With a scheduler that has a time-zone setting, pick **Europe/Lisbon** and use `0 6 * * *`. With a UTC-only scheduler:

- `0 6 * * *` UTC runs at 06:00 Lisbon in winter and 07:00 in summer.
- `0 5 * * *` UTC runs at 05:00 in winter and 06:00 in summer.

### Option A (recommended): cron-job.org
Free, has a per-job time zone, and needs no code.

1. Create a job with URL `https://receebo.net/api/internal/cron/daily-maintenance` and method POST.
2. Under Advanced → Headers, add `x-cron-secret` with the production `CRON_SECRET`.
3. Schedule: custom crontab `0 6 * * *`, time zone Europe/Lisbon.
4. Optionally add second and third runs at 06:10 and 06:20 (`0,10,20 6 * * *`). They only finish any `remaining` users, so they cost nothing when there's nothing left.

The scheduler gives up waiting after about 30 s, but the server finishes the run anyway. Check the result in the deployment logs: look for "Outlook sync: daily sweep finished".

### Option B: GitHub Actions
Only if the repo is on GitHub. Scheduled workflows accept `timezone:` since March 2026. Add a repo secret `CRON_SECRET`, then create `.github/workflows/daily-cron.yml`:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'
      timezone: "Europe/Lisbon"
  workflow_dispatch: {}
jobs:
  call:
    runs-on: ubuntu-latest
    steps:
      - run: >
          curl -fsS --max-time 300 -X POST https://receebo.net/api/internal/cron/daily-maintenance
          -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

GitHub can start scheduled runs several minutes late.

### Option C: Replit Scheduled Deployment
Not a good fit here. A Replit App has a single deployment, so switching it to Scheduled would replace the autoscale web app. It would need a separate small Repl whose run command is the curl below, with `CRON_SECRET` in its deployment secrets, time zone Europe/Lisbon, and cron `0 6 * * *`.

## 3. Manual test

Replace `<CRON_SECRET>` yourself; don't paste the real value anywhere shared.

```
curl -fsS -X POST https://receebo.net/api/internal/cron/daily-maintenance -H "x-cron-secret: <CRON_SECRET>"
```

For dev, use the dev URL (the `*.replit.dev` domain) with the dev `CRON_SECRET`. A 503 means the secret isn't set in that environment yet.
