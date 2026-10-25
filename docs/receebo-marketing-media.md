# Receebo real-app marketing media

## What ships

All interface imagery is captured from the existing Receebo React pages/components,
not generated or redrawn. The hero composes two genuine captures. No auth routes,
pricing flows, or product capabilities have been added.

| Landing slot | Export | Actual product surface |
| --- | --- | --- |
| Hero | `hero-{600,1200}.webp` | Phone library + desktop receipt sheet |
| Capture video / feature | `capture.mp4`, `capture-poster.webp` | File selection → existing review form → save → receipt detail |
| Find video / feature | `find.mp4`, `find-poster.webp` | Type “headphones” → matching receipt → open sheet |
| Protect video | `protect.mp4`, `protect-poster.webp` | Open receipt → scroll to warranty/consumer rights |
| Protect feature / protection section | `protection.webp` | Existing consumer-rights panel and legal citations |
| Prove feature | `original-receipt.webp` | Existing original-receipt viewer |
| Email section | `email-settings.webp` | Actual disconnected Gmail settings card; never connected |

Exports and the source archive live in existing App Storage, under
`marketing/receebo-real-app/v1/`, served through the existing public-objects route:

`/api/storage/public-objects/marketing/receebo-real-app/v1/<filename>`

`source-captures.tar.gz` contains lossless PNGs, the three original WebM recordings,
and fictional receipt fixtures. `manifest.json` maps the recordings to their exports,
records capture sizes/date, and confirms no unexpected network requests or browser
errors occurred. They contain no session files, credentials, cookies, or real users.
Local generated outputs are under `generated-artifacts/receebo-marketing/`, excluded
from Git and deployment. Tooling is committed under
`artifacts/receiptr/scripts/marketing/`, and excluded from deployment.

## Fictional collection and disclosure

Capture clock: **25 October 2026, noon UTC**, timezone Europe/Lisbon, locale en-GB.
Every amount is EUR, including applicable tax (no additional tax line):

* Northline Audio, online, Portugal, 20 October: headphones €169 + case €20 = **€189**.
  Fictional manufacturer warranty: two years on headphones, subject to terms.
  The real app independently computes its Portugal legal-warranty guidance and
  3 November return date. Manufacturer and statutory rights are distinct.
* Field & Form, online, Portugal, 17 October: lamp €59 + bulbs €15 = **€74**.
* Everyday Market, in-store, Portugal, 15 October: oil €12 + coffee €8 + bread €3.50
  = **€23.50**. No online cooling-off claim or manufacturer warranty.

Total collection: **€286.50**. Sample extraction is deterministic interception,
**not a live AI service or a measured speed claim**. The capture banner, captions,
hero caption, and visible demo disclosure identify fictional/simulated content.
Email imagery shows only the disconnected state, with no email address.
No Gmail, payment, outbound notification, production seed, or customer-data access
is used by the capture process.

## Isolation

This is an independent loopback-only Vite entry, **not** a public demo route or
production auth bypass. It imports real `SearchPage`, `Scan`, `ReceiptDetail`,
`Settings`, `AppShell`, and their existing components. Only this tooling config
aliases Clerk hooks to a credential-free fictional identity; normal `App.tsx`,
access controls, legal gates, and billing gates are untouched.

Playwright installs network interception before navigation. All `/api/` requests
are fulfilled from an explicit allowlist. Upload/create/save act only on in-memory
fixtures; no API server is involved. Unknown API calls and external requests fail
closed and fail the capture. The only allowed external reads are Google Fonts.
No credentials, storage state, HAR, or traces are recorded. Onboarding is explicitly
dismissed in this fresh browser's local storage. Service workers are blocked.
Do not point the capture harness at a real authenticated account.

Tailwind must scan the real source directory from this independent tooling root;
`capture.css` includes it explicitly. Captures without this would not reflect the
working application's layout. Fonts must finish loading before capture.

## Regenerate

From the workspace root, after `pnpm install`:

```sh
# Terminal 1 — independent local tool, not a second app preview workflow:
pnpm --filter @workspace/receiptr exec vite --config scripts/marketing/vite.config.ts

# Terminal 2 — Playwright and ffmpeg must be installed:
pnpm --filter @workspace/receiptr exec playwright install chromium ffmpeg
node artifacts/receiptr/scripts/marketing/record.mjs
node artifacts/receiptr/scripts/marketing/compose.mjs
```

On Replit, use the installed Chromium executable via `CHROMIUM_PATH` if needed.
If using a system ffmpeg rather than Playwright's bundled copy, link it at the
ffmpeg path reported by Playwright. No environment secrets are needed for capture.
`PLAYWRIGHT_MODULE` optionally names an existing Playwright module.

1. Update fixtures and capture date together. Keep amounts, receipt image, products,
   purchase country/channel, dates, and warranty statements consistent.
2. Inspect every still, watch all three clips in full, and inspect a contact sheet
   from **every decoded frame**. Confirm legible text and no private content.
3. Confirm the manifest has empty `errors` and `unexpected` arrays.
4. Archive only the current run's PNG/fixture files and the three WebMs named in
   the manifest. Include `manifest.json`. Do not include browser state.
5. Upload after inspection:

```sh
# Select only current-run sources, excluding obsolete recordings; add checksums.
node artifacts/receiptr/scripts/marketing/package.mjs
scripts/node_modules/.bin/tsx artifacts/receiptr/scripts/marketing/upload.ts
```

The uploader uses the app's existing sidecar-authenticated storage client and
existing public storage prefix, without printing secret values or signed URLs.
For future revisions, bump the version folder in both the uploader and
`MarketingMedia.tsx`; don't overwrite cached assets used by an existing release.
Record source/export SHA-256 checksums in the manifest before uploading.

## Export and integration settings

* Sources: desktop 1100×850 and phone 390×844 at 2× pixels; videos 960×640.
* Videos: original real-time WebM → silent H.264 MP4, CRF 23, slow preset,
  yuv420p, faststart. Initial load trimmed by 1.2 seconds; no fabricated steps.
  VP9 WebM (CRF 33, yuv420p) is offered first, with MP4 fallback. This also supports
  Chromium builds without proprietary H.264 codecs; both exports are inspected.
* Stills: WebP quality 88; hero responsive widths 600 and 1200.
* Approximate export budget: clips under 250 KB each, stills under 100 KB each.
* Videos have native controls, inline playback, no autoplay/loop, `preload="none"`,
  a real poster, labelled accessible descriptions, and direct-video links.
  Silent clips have equivalent written descriptions, not an empty caption track.
* Still images reserve dimensions, include meaningful alt text, and lazy-load
  below the fold. Hero is eager/high priority. Feature tabs no longer auto-advance,
  so screenshots remain available with motion disabled or without autoplay.

## Verify

```sh
pnpm --filter @workspace/receiptr typecheck
pnpm --filter @workspace/receiptr test
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/receiptr build
node artifacts/receiptr/scripts/marketing/verify.mjs
```

`verify.mjs` visits the **normal** signed-out landing page with no interception,
at 1440 and 390 pixels with reduced motion enabled. It checks images, posters,
no autoplay, all three clips' decodes/playback/seeking, manual feature tabs, overflow,
and browser errors. It saves screenshots/results in the ignored verification folder.
Set `LANDING_URL` if the development URL is not provided by the environment.
The capture verifies real component interactions with intercepted sample responses;
it does **not** verify signed-in end-to-end backend extraction or external services.

### Delivery verification

Desktop (1440 px) and phone (390 px) checks passed with reduced motion: all three
clips decoded and played, native seek worked, posters and each feature image
loaded, and no horizontal overflow or browser errors were found. Both MP4 and WebM
exports decoded completely with ffmpeg. All MP4 frames were inspected in sequential
contact sheets, in addition to the high-resolution source stills.

The existing public asset route now supports single byte ranges for videos
(including suffix ranges and 416 for unsatisfiable ranges), so native seeking does
not require downloading the entire file. Protected receipt routes are unchanged.
The frontend test suite passed (43 tests), the API suite passed (38 tests), both
web/API typechecks passed, and the production web build passed. Existing build warnings about `VITE_APP_URL`, chunk
sizes and source maps are unrelated to these media changes.
