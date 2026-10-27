# Receebo real-app marketing media

## What ships

All interface imagery is captured from the existing Receebo React pages/components,
not generated or redrawn. The hero composes two genuine captures. No auth routes,
pricing flows, or product capabilities have been added.

| Landing slot | Export | Actual product surface |
| --- | --- | --- |
| Hero (two phones) | `library-phone.webp`, `receipt-phone.webp` | Phone library (no category pill on rows) + phone receipt sheet |
| Capture video / feature | `capture.mp4`, `capture.webm`, `capture-poster.webp` | File selection → existing review form → save → receipt detail |
| Find video / feature | `find.mp4`, `find.webm`, `find-poster.webp` | Type “TV” → matching receipt → open sheet |
| Protect video | `protect.mp4`, `protect.webm`, `protect-poster.webp` | Open receipt → scroll to warranty/consumer rights |
| Protect feature / protection section | `protection.webp` | Consumer-rights panel: legal + manufacturer warranty side by side |
| Prove feature | `show-to-store.webp` | Full-screen "Show to store" view (phone, 390×640) |

`library-desktop.webp` and `receipt-desktop.webp` are captured as reference stills only.
Since v2 the unused Gmail `email-settings` still and the composed `hero-*.webp` are no
longer produced.

Exports and the source archive live in existing App Storage, under
`marketing/receebo-real-app/v3/` (v1/v2 stay for older releases; v3 replaced the inline original-receipt viewer, removed from the app, with Show to store), served through the existing public-objects route:

`/api/storage/public-objects/marketing/receebo-real-app/v3/<filename>`

`source-captures.tar.gz` contains lossless PNGs, the three original WebM recordings,
and fictional receipt fixtures. `manifest.json` maps the recordings to their exports,
records capture sizes/date, and confirms no unexpected network requests or browser
errors occurred. They contain no session files, credentials, cookies, or real users.
Local generated outputs are under `generated-artifacts/receebo-marketing/`, excluded
from Git and deployment. Tooling is committed under
`artifacts/receiptr/scripts/marketing/`, and excluded from deployment.

## Fictional collection and disclosure

Capture clock: **27 October 2026, noon UTC**, timezone Europe/Lisbon, locale en-GB.
The collection matches the dev demo account, the promo video and the Taikai banner.
Every amount is EUR, including applicable tax, all bought in store in Portugal:

* Casa Lumen Electrónica, 23 October: 55" 4K Smart TV **€649.00**. Receipt text:
  "2-year manufacturer warranty" (until 23 Oct 2028). The real app independently
  computes the Portugal 3-year legal warranty (until 23 Oct 2029). The two are shown
  side by side, never added. In store, so no online withdrawal countdown.
* Casa & Jardim Braga, 12 October: cordless vacuum **€229.00**, 2-year manufacturer warranty.
* Mercado Verde, 19 October: groceries **€38.47**.
* Atelier Norte, 4 October: cotton shirt €35 + wool scarf €24.90 = **€59.90**.

Total collection: **€976.37**. Sample extraction is deterministic interception,
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

### Opt-in release freshness gate

Run this before a release that changes product pages, shared components, styles,
fixtures, public fonts/images, or API client contracts:

```sh
# Fast source-only check (no browser, services, or uploads):
pnpm --filter @workspace/receiptr marketing:status
# Full isolated capture check (Chromium + ffmpeg required):
CHROMIUM_PATH="$(command -v chromium)" pnpm --filter @workspace/receiptr marketing:check
# Tooling regression tests:
pnpm --filter @workspace/receiptr test:marketing-freshness
```

These commands work from the workspace root or the package directory. They are
opt-in: normal builds/tests do not regenerate media. Add `marketing:check` as an
explicit release step when marketing freshness is relevant; do not point it at
production or pass a signed-in browser session. Unlike `verify.mjs`, it never
visits the normal landing page or App Storage.

`marketing:check` starts its own loopback-only server on port 5199, runs
`record.mjs` (including fixture-driven upload/save/search/protection interactions),
`compose.mjs`, and `package.mjs`, then stops the server even on failure. No API
server is needed. Child processes inherit only runtime/browser paths and locale,
not service secrets or `VITE_*` configuration. Interception still fails closed;
Google Fonts are the only allowed external reads. A busy port fails rather than
attaching to an existing server. Runtime steps have bounded timeouts.

The gate fingerprints the entire web source tree (excluding tests), public assets,
capture tooling, package/lockfile, and shared client/storage source. This is
deliberately conservative: unrelated source changes may also need acknowledgement.
Added/deleted files count too. It prints changed paths and writes
`generated-artifacts/receebo-marketing/freshness-report.json` only after a complete,
error-free capture. A failure invalidates any prior report. A concurrent capture
fails rather than mixing evidence; after an interrupted process, ensure no
capture is running before deleting the ignored `.release-check-lock` directory.

Exit **0** means captures passed and source inputs match a visually approved
baseline. Exit **1** means either capture/tool failure or **MEDIA REVIEW REQUIRED**;
read the output to distinguish them. Fresh captures do not automatically establish
visual correctness, and binary video bytes are not used as deterministic visual
snapshots. There is intentionally **no pre-approved baseline** for the older
published assets: the first run also requires human inspection.

After a successful capture, review every still and hero, watch each of the three
clips in both MP4 and WebM, and follow the decoded-frame/privacy checks below.
Compare them with the currently published media. Only then acknowledge review:

```sh
pnpm --filter @workspace/receiptr marketing:approve --visual-approved
pnpm --filter @workspace/receiptr marketing:status
```

Approval records input and exact export hashes in
`scripts/marketing/approved-media.json`; commit it alongside the reviewed source
changes. This is an explicit human attestation, not automated visual approval.
Approval refuses failed, missing, modified, or source-stale capture evidence.
The check and approval commands **never upload anything or change landing URLs**.
If current exports still accurately represent the product, record that decision
in the release/PR; otherwise perform the separate versioned upload below.

The uploader also requires matching visual approval and uses create-only writes:
it will refuse to overwrite an existing public object. Before uploading refreshed
exports, change the version prefix in `upload.ts` and `MarketingMedia.tsx`, then
rerun the capture/review/approval (those source changes invalidate the baseline).
Never edit an old release's version folder in place. After any regeneration,
review and approve again before upload because the exact export bytes may differ.

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
# Install the browsers matching this package's Playwright version:
pnpm --filter @workspace/receiptr exec playwright install chromium firefox webkit
pnpm --filter @workspace/receiptr test:marketing-ranges
pnpm --filter @workspace/receiptr test:marketing
```

`verify.mjs` visits the **normal** signed-out landing page with no interception,
fixtures, auth bypass, or stored login session. Chromium, Firefox, and WebKit each
run at 1440 and 390 pixels, with both reduced motion and normal motion: 12 fresh
contexts in total. This is landing-page media delivery coverage, not PWA
installation testing. It checks:

* Native controls, inline playback, no loop/autoplay, `preload="none"`, and videos
  remaining paused at time zero after scrolling into view, in both motion modes.
* Posters decoding independently before playback. Native controls are asserted
  through DOM properties; OS-specific controls chrome is not pixel-tested.
* The actual WebM-first / MP4-fallback source order and native `currentSrc`
  selection, followed by separate playback probes for **each supported codec**.
  Playback must advance and decode a 960×640 frame; seeking must emit `seeked`,
  decode a frame near the end, and resume advancing. All media waits are bounded.
* For all six delivered video URLs, full GET, explicit (`0-63`), open-ended,
  suffix (`-64`), and end-clipped byte ranges, with exact status, MIME,
  `Accept-Ranges`, `Content-Range`, length, and **byte-content** comparisons.
  Out-of-bounds, reversed, zero suffix, and unsupported multiple ranges must return
  416, `Content-Range: bytes */<size>`, and no video bytes.
* Manual feature images, viewport overflow, asset HTTP failures, and page errors.

Results are written after every check, including failed browser launches, to
`generated-artifacts/receebo-marketing/verification/results.json`. Screenshots
are named by engine, width, and motion mode. Failures name the check, engine,
viewport and clip or asset URL, with an error stack. Any failed assertion or
missing engine returns exit code **1**, while the remaining checks continue.
`test:marketing-ranges` tests the verifier's ability to catch wrong bytes, headers,
status, MIME and ignored Range requests; it does not replace the live checks.

Set `LANDING_URL` to a development preview if the URL is not provided by the
environment. Only loopback and `.replit.dev` targets are accepted, not production.
The script only reads public marketing assets and clicks feature tabs/video
surfaces. It never signs in, scans receipts, writes app data, or opens Gmail,
payment, or email flows. Normal signed-out auth initialization is left intact.

**Server safety:** Do not start the API's normal `src/index.ts` just for this
check in an environment with live connections: it also runs migrations, Stripe
webhook/backfill setup, Gmail scheduling and cleanup. Use a safe development
server with those jobs disabled/absent. For local verification, the existing
Express `src/app.ts` can be bundled and listened on the existing API port without
importing `src/index.ts`; this preserves normal auth and the actual storage route
without starting background jobs. Only public marketing GET requests are needed.

### Engine limitations and failure triage

* Playwright WebKit is a Safari-engine regression check, **not actual macOS/iOS
  Safari**. Native controls styling, touch scrubbing, hardware decoding, and
  device fullscreen behavior still need a real-device smoke check.
* Codec availability depends on the installed browser/OS. The workspace's system
  Chromium may lack H.264; Linux Firefox/WebKit may require multimedia libraries.
  Generic container support is not enough: results record VP9 and H.264
  `canPlayType` probes. Unsupported single-format probes are explicitly logged
  as `LIMITED` and recorded under `limitations`, never described as playback
  passes. At least native playback must succeed. A successful run with codec
  limitations does **not** certify those formats; rerun on a codec-enabled host.
* Missing Firefox/WebKit executables or shared libraries are **failures**, not
  silent skips. On supported Linux CI, install browser dependencies with
  `pnpm --filter @workspace/receiptr exec playwright install --with-deps`.
  On Replit/Nix, use compatible system packages rather than copying the
  Ubuntu `apt` suggestions blindly. Do not replace Firefox/WebKit with Chromium.
* On this workspace, run Chromium with
  `CHROMIUM_PATH=/repl/tools/bin/chromium pnpm --filter @workspace/receiptr test:marketing`.
  `CHROMIUM_PATH` only overrides Chromium. `PLAYWRIGHT_MODULE` can select an
  installed module; its browser versions must match. `MARKETING_ENGINES=firefox`
  (or a comma-separated subset) is for diagnosis only: the report marks a
  partial matrix and the console warns that it is not the full release check.
* For `controls-poster-no-autoplay`, inspect the shipped markup/poster URL.
  For playback/seek failures, inspect `currentSrc`, codec support, decoder errors
  and the relevant range check. For 404/5xx, confirm the public versioned assets
  and API routing. Never work around failures by bypassing auth or changing
  protected receipt delivery.

The capture verifies real component interactions with intercepted sample responses;
it does **not** verify signed-in end-to-end backend extraction or external services.

### Cross-engine check in this workspace (25 October 2026)

The verifier's eight regression tests passed. Chromium's desktop/phone checks
passed in both motion modes, including independent VP9 WebM and H.264 MP4
playback and resumed seeking for all three clips. All six public video URLs
passed the byte-range/content checks.

Firefox and WebKit were downloaded at the matching Playwright version but could
not launch because this workspace lacks their required shared libraries (Firefox
X11/GTK dependencies; WebKit GTK/GStreamer/ICU and related libraries). Their
launch failures are captured in the JSON report and make the full command exit
nonzero. **This is not a Firefox/WebKit playback pass or a full release sign-off.**
Run the full command on a dependency-complete host before release.

These checks used the ordinary signed-out landing page and the unchanged Express
app/auth/storage handler served without the API startup entry point or its
background jobs. No authenticated product flows were exercised.

### Original media delivery baseline

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
