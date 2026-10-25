# Receebo PWA: behavior, evidence, and device checklist

## Scope and audit

This extends the existing web artifact, generated manifest, and single custom
Workbox service worker. It does not change the Expo product, database schema,
OCR, payment credentials, consent requirements, or subscription rules.
Nothing was published and no external checkout or real-money payment was made.

| Area | Before | Result |
| --- | --- | --- |
| Installation assets | Generated manifest, standalone display, PNG/maskable icons, Apple metadata already present | Retained; added stable manifest ID; production assets checked at `/` and `/receebo/` |
| Install UI | No platform guidance | Chromium/Android install button only after a real `beforeinstallprompt`; Safari on iPhone/iPad receives Share → Add to Home Screen → Add instructions |
| Updates | Unconditional `skipWaiting()` | Explicit update approval, work/mutation/auth guards, refusal with multiple open windows, bounded activation wait |
| Offline | Precached shell but externally loaded authentication could prevent useful startup | Self-contained precached offline document for failed/timed-out known app navigations; live connection banner preserves the current page/drafts |
| Navigation privacy | API denylist only | Allowlist of product pages; APIs, Clerk paths, auth callbacks, other artifacts, unknown URLs, and private files stay network-only |
| Private files | `private, max-age=3600` could reuse a file without rechecking ownership | `private, no-store`, identity-dependent `Vary`, versioned file URLs avoiding legacy cache entries, no-store preview fetches, protected screens remount on identity changes |
| Mobile accessibility | Viewport restricted zoom; no global notch padding; small profile/fullscreen-close targets | Pinch zoom allowed, safe-area padding, 44px affected controls, mobile input text at 16px |

## User-visible rules

- No automatic install dialog. Unsupported browsers receive no fabricated
  install offer. Installation guidance is hidden in standalone/fullscreen mode
  and after `appinstalled`, and can be dismissed for the current page session.
  The browser remains responsible for installation eligibility.
- Safari cannot reliably tell a normal browser tab whether a separate Home
  Screen copy is already installed. Standalone detection works **inside that
  copy**; a normal Safari tab can still show instructions. Desktop browsers
  without `beforeinstallprompt` receive no custom automatic prompt; their native
  install/Add to Dock menus, where supported, remain available.
- “Update now” is disabled throughout Scan (including camera permissions,
  conversion, panorama, reading and review), receipt editing, attachment
  uploads/removal, account export/deletion dialogs, legal consent submission,
  post-auth checkout checks, other pending mutations, and auth routes.
  Save/discard and leave Scan to update. Even if work begins during an activation
  race, the controller-change handler refuses to reload over it.
- The waiting worker checks all same-origin windows immediately before
  activation. Close other Receebo tabs/windows first. An accepted update reloads
  only the window that explicitly requested it. Other controller changes do not
  cause a reload. The normal browser lifecycle can activate a waiting version
  after all old windows have been closed.
- While applying, a focused blocking overlay prevents starting new work.
  Rejection or timeout releases it and explains how to retry; no forced reload.
- After a successful online visit has installed the production worker, known
  app-page reloads use the network or, on failure/HTTP 5xx/6-second timeout, a
  precached static connection-required page. This page needs no remote fonts,
  authentication scripts, receipt data, or API requests. First-ever visits
  without internet cannot be made offline-capable retroactively.
- Network loss in an already open app shows a banner instead of unmounting
  unsaved work. Keep the page open until connected. Browser connectivity events
  are advisory; action failures still depend on actual server responses.
- Receipts, receipt images, edits, uploads, sign-in, billing, and AI processing
  are not available offline. No action queue, background sync, runtime API cache,
  or persistent receipt cache was added. Mutations execute or fail, rather than
  pausing for automatic replay on reconnect. Failed retake/discard deletions now
  keep the current scan instead of pretending it was removed.
- Auth routes/callbacks deliberately have no offline navigation fallback.
  Reconnect to complete authentication, Gmail OAuth, checkout, and billing.

## Automated/browser evidence

Verified in the development workspace, **not a published production deployment**:

| Check | Evidence |
| --- | --- |
| Frontend tests | `pnpm --filter @workspace/receiptr test`: 87 tests passed, including existing legal/plan gates plus install, update guards, navigation exclusions, notification deep links, mocked camera capture/cleanup and JPEG/PNG/PDF signed-upload paths |
| API tests | `pnpm --filter @workspace/receiptr test:api`: 43 tests passed, including private/public cache policies, ownership-denied/deleted-file and signed-out/upload-error responses |
| TypeScript | Both web and API artifact typechecks passed |
| Production build | `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/receiptr build`: manifest plus one injected worker and static precache generated |
| Mounted-path build | `PORT=5000 BASE_PATH=/receebo/ pnpm --filter @workspace/receiptr build --outDir ../../generated-artifacts/pwa-prefix`: ID, start URL, scope, icon URLs/files, and manifest link validated |
| Production Chromium | `Page.getInstallabilityErrors` returned an empty array in a fresh non-incognito browser profile |
| Assets | Generated manifest has standalone display and maskable icon; declared PNG dimensions match file headers |
| Offline browser | Successful visit → actual offline reload → static offline page → reconnect/retry works. Offline API fetches fail and private-file navigations are not replaced by SPA HTML |
| Cache contents | Production Cache Storage contains static assets, not API, authentication, receipt files, or Stripe responses |
| Worker lifecycle | Changing served worker bytes creates a waiting update; a second tab prevents activation; closing it and explicitly applying triggers a successful reload |
| Public mobile/desktop layout | Browser widths 390 and 1280 checked for horizontal overflow; public-page screenshots recorded |
| Checkout safety | Existing billing/owner tests mock Stripe; no external checkout session was created for these checks |

The browser script temporarily serves the production output on the existing web
artifact port through the shared preview proxy. It does not bypass app auth.
Its server is a static test fixture; it is not production hosting evidence.
The script uses a fresh temporary browser profile and removes it afterward.

### Repeating the production-browser check

1. Build the root-path web artifact with the command above.
2. Stop the managed `artifacts/receiptr: web` development workflow so the existing
   port is free. Do not run two servers on it.
3. Run:

   ```sh
   PORT=5000 PWA_CHROMIUM_PATH=/repl/tools/bin/chromium \
     pnpm --filter @workspace/receiptr test:pwa
   ```

   Outside this workspace, install a Playwright Chromium browser and omit
   `PWA_CHROMIUM_PATH`, or point it to an available compatible browser.
   The shared proxy must route the artifact to that port.
4. Restart the managed development workflow.

Generated screenshots/build output go under ignored `generated-artifacts/`.
They are not committed or shipped. Browser profiles must not be reused as
authenticated test accounts.

## What is not verified by those checks

- No physical iPhone, Android phone, notch/home indicator, software keyboard,
  installed standalone runtime, camera hardware, native installation dialog,
  real push delivery, or OS lifecycle was tested.
- Signed-in screens were checked with component/unit tests and source
  integration, **not a signed-in browser screenshot or full authenticated E2E**.
  The automated camera test mocks the stream, compression, upload and API; it
  does not prove real camera quality, panorama stitching, or AI extraction.
- Mocked ownership tests prove the route still denies missing ownership and
  sends no-store headers; they are not two real Clerk accounts or browser-cache
  tests with real private files.
- Live Google/Clerk login, consent after a real signup, Gmail return navigation,
  Stripe test checkout/portal return, and push delivery need the manual checks
  below. No live checkout test should be used.
- Browser HTTP caches created by an older app cannot be remotely erased
  universally. Updated links bypass their old cache keys. Close obsolete app
  tabs during rollout; old URLs, already downloaded files, OS snapshots and
  separate tabs holding blob copies cannot be revoked by this change. Where
  immediate cleanup of legacy browser state is needed, close all app windows
  and clear site data/reopen online. This can sign the user out.
- Existing build warnings remain: unset `VITE_APP_URL` social/canonical
  metadata, UI sourcemaps, mixed image-compression imports, and large chunks.
  These do not fail the PWA build and are not installation evidence.
- Both managed web/API workflows were restarted and serve requests. The API
  still logs the existing Stripe migration duplicate `handle_updated_at`
  trigger warning, then continues serving. That billing migration issue is
  already tracked separately and was not changed here.
- A real signed-out request through the local shared proxy returned 401 JSON
  with `Cache-Control: private, no-store` and identity-related `Vary` headers
  for a private-file URL. It did not return SPA HTML.

## Real-device / authenticated manual checklist

Use a non-production test account and receipts containing no personal data.
Record OS/browser version and whether running in-browser or installed.

- [ ] **iPhone Safari:** guidance says Share → Add to Home Screen → Add; dismiss
  works; install; reopen from the icon; confirm standalone display, icon and
  **no in-app install guidance**. Check portrait, landscape, notch and home
  indicator. In-app browsers/unsupported browsers should not show a native
  install button.
- [ ] **Android Chrome and desktop Chrome/Edge:** await genuine browser
  eligibility; install button opens the native prompt only on click. Test
  dismissal, accepted installation, standalone reopening, uninstall/reinstall.
  Test non-supporting browsers receive no automatic install offer.
- [ ] **Keyboard/zoom:** focus merchant, total and warranty at small widths;
  keyboard must not hide the active input or prevent scrolling to Save.
  Pinch zoom and OS text enlargement must still work. Open the receipt sheet,
  full-screen preview and account dialogs; close controls and action rows must
  remain reachable with safe areas.
- [ ] **Safe update:** run versions A and B in a test environment; leave A in
  camera capture, panorama, slow image conversion/PUT, extraction, receipt review,
  detail/sheet editing, deletion/export or checkout initialization. Verify the
  update never reloads over work. Save/discard and leave Scan; close the second
  app window; apply. Also test network loss and worker activation failure.
- [ ] **Offline:** visit online once, close/reopen in airplane mode on known
  product routes; see the offline page. Offline API/private-file URLs must fail,
  not return SPA HTML. Lose connectivity while editing; draft stays on screen;
  Save/upload/delete cannot claim success or silently replay after reconnect.
  Reconnect and explicitly retry. Verify no receipt/API entries in Cache Storage.
- [ ] **Files/privacy:** account A opens a primary image/PDF and attachment;
  check `Cache-Control: private, no-store` and `Vary`. Sign out; old file request
  is denied. Sign in as account B; A's previews disappear and file requests are
  denied. Delete a receipt/attachment and repeat the URL request (404). Check
  receipt detail and sheet, downloads and full-screen previews. Public assets
  should retain their public policy.
- [ ] **Camera/uploads:** grant and deny permission, single capture, panoramic
  retake, JPEG/PNG/PDF file input, slow and failed signed PUT, save/discard,
  duplicate/incomplete warnings, and attachments all work without update reloads.
- [ ] **Auth/legal:** fresh signup, age/terms/privacy acceptance, rejected/failed
  acceptance, sign-out, account switch, external Google login and Gmail OAuth
  return to the intended route. Offline mode must not bypass either legal or
  plan selection gates.
- [ ] **Billing:** only in a verified **Stripe test-mode** environment, test plan
  selection → sign-up/consent → checkout, cancel and success returns, portal
  navigation and subscription polling from both browser and standalone. Do not
  change production credentials or run real-money checkout.
- [ ] **Push:** in a platform-supported installed environment, grant permission,
  deliver a real test push, then tap with an app window open and with none open.
  The intended receipt deep link must open inside the artifact scope.

## Changed files and reasons

All paths below are relative to the repository root.

- `artifacts/receiptr/vite.config.ts`: retain generated manifest/custom-worker
  infrastructure, select prompt updates, stable manifest ID.
- `artifacts/receiptr/index.html`: safe-area viewport and accessible zoom.
- `artifacts/receiptr/public/offline.html`: precached, self-contained offline
  navigation document without private data or remote dependencies.
- `artifacts/receiptr/src/sw.ts`: scoped network-only navigations/static offline
  fallback and explicit single-window activation; preserve push handlers.
- `artifacts/receiptr/src/main.tsx`: existing registration moved to the PWA helper;
  offline startup avoids mounting authentication.
- `artifacts/receiptr/src/App.tsx`: app status UI, checkout work guard, no paused
  mutation queue, identity-keyed protected subtree.
- `artifacts/receiptr/src/lib/pwa.ts`: one registration, installation detection,
  work blockers, waiting-worker subscription and activation handshake.
- `artifacts/receiptr/src/lib/navigationRoutes.ts`: product navigation allowlist.
- `artifacts/receiptr/src/lib/privateFileUrl.ts`: legacy browser-cache migration.
- `artifacts/receiptr/src/components/PwaStatus.tsx`: install/network/update notices,
  explicit approval, busy/failure handling.
- `artifacts/receiptr/src/components/OfflineStartup.tsx`: offline bootstrap guard.
- `artifacts/receiptr/src/components/AppShell.tsx`: base-aware logos, profile
  target/label, shrinkable main content.
- `artifacts/receiptr/src/components/LegalConsentGate.tsx`: protect pending consent.
- `artifacts/receiptr/src/components/PrivacyAndDataSettings.tsx`: protect account
  export/deletion and confirmation state.
- `artifacts/receiptr/src/components/ReceiptPreview.tsx`: no-store blob fetch.
- `artifacts/receiptr/src/components/ReceiptSheet.tsx`: edit/upload guards,
  versioned private URLs, sheet safe areas.
- `artifacts/receiptr/src/components/StoreFullscreen.tsx`: safe-area close control,
  44px target.
- `artifacts/receiptr/src/pages/scan.tsx`: guard full capture/review session,
  refuse offline upload, do not misreport failed retake/discard deletion.
- `artifacts/receiptr/src/pages/receipt-detail.tsx`: edit/upload guards and
  versioned receipt/attachment URLs.
- `artifacts/receiptr/src/index.css`: safe-area padding, wrapping, mobile input
  sizes and new status-button targets.
- `artifacts/api-server/src/lib/objectStorage.ts`: private files are no-store;
  public caching remains available.
- `artifacts/api-server/src/routes/storage.ts`: no-store even on private/auth
  errors and signed-upload responses; retain ownership checks.
- Tests: `artifacts/receiptr/src/lib/{pwa.test.tsx,sw.test.ts}`,
  `artifacts/receiptr/src/components/PwaUpdates.test.tsx`,
  `artifacts/receiptr/src/pages/scan.pwa.test.tsx`,
  `artifacts/api-server/src/lib/objectStoragePrivacy.test.ts`,
  `artifacts/api-server/src/routes/storagePrivacy.test.ts`.
- `artifacts/receiptr/scripts/pwa-browser-check.mjs`: repeatable production-worker
  lifecycle, installation-assets and offline browser checks.
- `artifacts/receiptr/package.json`, `pnpm-lock.yaml`: browser test dependency
  and command.
- `.replit`: register the focused private-storage tests as a validation step.
- `.gitignore`, `.replitignore`: keep generated browser/build assets and downloaded
  browsers out of version history/deployments.
- `artifacts/receiptr/PWA-VERIFICATION.md`: audit, evidence, limitations and checklist.
- `.agents/memory/{MEMORY.md,pwa-dev-worker.md,pwa-offline-startup.md}`:
  retain the production-only precache constraint and reason for independent
  offline startup.
