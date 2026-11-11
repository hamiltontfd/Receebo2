# Isolated marketing captures

Tooling only: real app components, fictional auth/receipts, fail-closed API
responses. This is not an application route and never needs the web/API workflows.
No recording or test uploads media, publishes the app, or approves a new release.

## Contexts

| CAPTURE_CONTEXT | Market / account language | Browser locale / timezone | Output |
| --- | --- | --- | --- |
| `eu` or `pt` (default) | PT / pt-PT | pt-PT / Europe/Lisbon | generated-artifacts/receebo-marketing |
| `us` | US / en | en-US / UTC | generated-artifacts/receebo-marketing-us |
| `br` | BR / pt-BR | pt-BR / America/Sao_Paulo | generated-artifacts/receebo-marketing-br |

From the repository root, when recording is requested, use **two terminals**
with the **same context**. The loopback server is temporary tooling, not a Replit
workflow; stop it after the capture:

```sh
# Terminal 1 — choose eu, us or br
CAPTURE_CONTEXT=eu node artifacts/receiptr/scripts/marketing/capture-server.mjs
# Terminal 2 — use the same selection
CAPTURE_CONTEXT=eu node artifacts/receiptr/scripts/marketing/record.mjs
```

Replace `eu` with `us` or `br` in both commands. `pt` aliases `eu`.
Chromium/Playwright and ffmpeg must already be available. `CHROMIUM_PATH` and
`PLAYWRIGHT_MODULE` select existing installations.

All markets record:
- Six hero scenes: `home`, `upload`, `review`, `detail`, `warranty`,
  `home-desktop` (aliases of the matching landing/scan stills).
- Landing stills: `library-phone`, `receipt-phone`, `protection`,
  `show-to-store`, plus desktop stills.
- Silent `capture`, `find`, `protect` clips: MP4 and WebM, with WebP posters.

Phone stills are 390×844 at 2x (780×1688); desktop library is 1440×900 at
2x (2880×1800); videos/posters are 960×640 at 1x. Protection is an element
capture of the current item-coverage UI, not a fixed-size old rights card.
`CAPTURE_CLIPS=0` explicitly requests stills only. The default records all clips.

### Partial review / Capture recapture

With the isolated server running in the matching context, from the repository root:

```sh
CAPTURE_CONTEXT=eu CAPTURE_ONLY=review,capture CAPTURE_CLIPS=1 \
CHROMIUM_PATH=/repl/tools/bin/chromium \
node artifacts/receiptr/scripts/marketing/record.mjs
```

Repeat with `us` and `br`, stopping only the isolated server between contexts.
`CAPTURE_ONLY` accepts `upload`, `review`, `capture`, alone or combined; unknown names fail closed.
For upload and Capture only, use `CAPTURE_ONLY=upload,capture CAPTURE_CLIPS=1`.
An upload-only run (`CAPTURE_ONLY=upload CAPTURE_CLIPS=0`) opens `/scan`,
writes `scan-upload` and its `upload` alias (780 × 1688 PNG, plus WebP), and
never uploads the fictional file, enters review, or clicks Save.
Without the variable, the existing full capture is unchanged. `review` writes
`scan-review-form` (the pre-save form), then `scan-review` and its `review` alias
(PNG/WebP) showing the real post-save black hero card. The recorder moves the
pointer away and waits for the localized saved-purchase toast to become fully
hidden, including its exit animation, before taking that hero still. A timeout
writes the standard `sources/failure.png` and `sources/failure.json`.
`capture` writes only the Capture
video (MP4/WebM, plus its raw recording) and poster (PNG/WebP). The clip holds
the fully visible TOTAL for three seconds before scrolling to Save.

Only the isolated harness launches Chromium with `--use-fake-device-for-media-stream`
and `--use-fake-ui-for-media-stream`, grants the context camera permission, and
keeps `--no-sandbox` plus the context's `--lang`. This lets headless upload
stills use a simulated camera without changing the product camera UI.
The shared Playwright `isolate` init overrides `getUserMedia` with a live
720 × 1280 canvas stream painted nearly black (`#0d0c0b`), rather than Chromium's
green test pattern. This applies to both upload stills and Capture clips, keeps
the real camera controls, and stops the repaint timer when the stream is stopped.

Partial runs overwrite only the selected media in the usual context folder,
use a temporary fictional input document, and write `manifest.partial.json`
and `sources/layout.partial.json`. They leave the previous full manifest,
fixture document and unrelated media untouched; partial evidence is not a full
capture approval. Download copies belong only in the gitignored
`artifacts/receiptr/public/_capture-tmp/{eu,us,br}/`; never force-add those files.

The receipt input and Show-to-store original use the context's language and
currency. All three use a PNG generated from a fictional document, so the real
app opens its fullscreen receipt view (PDF originals open a separate browser tab).
The existing PDF helper remains available for document/tooling checks.
All contexts have fixed capture dates in fixtures; no live account/backend data
or dynamically authored legal policy is used.

## Pure checks (no server, browser recording, or database)

```sh
node --test artifacts/receiptr/scripts/marketing/freshness.test.mjs
pnpm --filter @workspace/receiptr exec vitest run --config vitest.marketing-fixtures.config.ts
```

The isolated Vitest config has **no database globalSetup**. Do not substitute
`test:api`, which runs database setup.

BR rights are locked in `br-item-rights.json`. To print a freshly evaluated
version without writing any files:

```sh
pnpm --filter @workspace/scripts exec tsx ../artifacts/receiptr/scripts/marketing/evaluate-br-fixture.ts
```

This calls the app's `evaluateItemRights` with `purchaseCountry: BR`, BRL,
delivery date, online purchase and the existing non-US `region: PT` branch.
The latter is an internal branch name, not a choice of Portuguese legislation.
Keep computed CDC rules, dates and legal-review flags unchanged. The fixture
test compares every saved contract against a fresh evaluation.

Existing EU release approval/upload tooling is separate and unchanged. These
captures do not update `approved-media.json`, public files, App Storage, or any
landing references. Visual review and asset integration are later decisions.
