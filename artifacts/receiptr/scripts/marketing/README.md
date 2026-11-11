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
