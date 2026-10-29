# Locales and consumer rights by country (Brazil, US)

Status: market preference and purchase-country editing are implemented on web/PWA.
The public landing page and market selectors support browser-language copy.
The web/PWA application interface is localized in en/pt-PT/pt-BR; BR/US legal documents remain scaffolding. Everything marked [LEGAL REVIEW NEEDED]
needs a lawyer before it ships. Sources: `/workspace/receebo/consumer-rules-br-us.md`,
`/workspace/receebo-site-ptBR.md`, email spec §2.

## Locales (`artifacts/receiptr/src/lib/locale.ts`)
- Language preference scope (web/PWA): explicit English, Português (Portugal),
  Português (Brasil), or automatic browser language. Applies immediately to
  landing, navigation, library/search, scanning/review, imports and recurring
  suppliers, receipt details/attachments, statistics, profile, settings,
  subscription gates, notifications, privacy/export/deletion, offline and error
  states, installation notices and consumer-rights copy. Receipt PDF labels also
  use this language. Shared app copy is in `appCopy.ts`, using the existing locale
  source; translated labels never replace canonical category/API values.
  External authentication, legal documents, recorded media, native mobile and
  original receipt/merchant/item/AI-extracted content are outside this UI coverage.
  Application-owned emails use the account preference as documented below;
  automatic email language is English, independently of browser language.
  The selector discloses these boundaries rather than claiming those contents
  are translated. Switching language does not remount forms or clear draft edits.
- Signed-in preferences are stored per account, available without subscription.
  Null means automatic browser language for the interface. Visitors always use
  browser language; the homepage has no manual language selector. Manual language
  changes belong only in signed-in settings. Legacy visitor language overrides
  are ignored; accounts never write their language into browser-wide storage.
  Signing out restores automatic browser language.
  Language never changes market, purchase country, receipt/subscription currency,
  or the legal rules applied to a purchase.
- `en`, `pt-PT`, `pt-BR`. Fallback: pt-BR → pt-BR, other pt → pt-PT, else en.
- `getAppLocale()` reads the active account language (or browser language in
  automatic mode), independently of market and purchase country. Signed-out
  visitors use browser language, ignoring legacy localStorage language overrides.
- The public landing page, including FAQ, pricing, navigation and media
  explanations, and shared market selectors have English, pt-PT and pt-BR copy.
  Consumer-rights copy also uses that locale. Screenshot/video content remains
  in its recorded language and Portuguese captions disclose English recordings.
- Compact market selectors show the inferred market code immediately when
  available. Suggestions remain unconfirmed, with confirmation inside the menu;
  nothing opens automatically. Unknown location uses a neutral region control,
  not a fabricated Portugal selection.
- Web dates/money follow the email spec table (en "Dec 12, 2026" / "€449.00";
  pt-PT "12 dez 2026" / "449,00 €"; pt-BR "12 de dez. de 2026" / "€ 449,00").

## Account email language
- All application-owned emails in `artifacts/api-server/src/lib/emailService.ts`
  use the account's current `user_preferences.language`: warranty/return reminders,
  legacy Stripe trial endings, renewal payment failures, deletion warnings,
  deletion codes and post-deletion confirmations. Subjects, preheaders, HTML,
  text, buttons and footers support en, pt-PT and pt-BR.
- **Automatic without a browser means English.** Null/missing/unsupported language
  resolves to en, independent of browser headers, server locale, market, visitor
  settings and receipt country. No browser language is persisted implicitly.
  A preference-read failure aborts the send instead of sending the wrong language.
- Resolve on each send (no stale language cache). Capture the language together
  with the contact **before deleting the account**; confirmations use that snapshot.
- Email formatting preserves existing English en-GB formatting; Portuguese uses
  the corresponding Intl locale. Dates are rendered in UTC without altering the
  actual date/deadline, and amounts use their original currency (no conversion).
  Payment access cutoffs also include their exact UTC timestamp. Warranty kind,
  statutory window length and retailer-policy basis are taken from receipt facts,
  never inferred from account language or market. User/merchant/product/plan
  names and receipt text are not translated.
- From/Reply-To addresses, links, unsubscribe tokens/headers and provider
  idempotency keys do not change with language. Transactional deletion/payment/
  trial emails do not acquire an unsubscribe link.
- Clerk authentication mail, Stripe's own billing mail, push notifications,
  legal documents and the existing legal-review/address placeholders are outside
  this application-template scope. Provider-owned mail does not automatically
  follow this database preference. Tests mock delivery; they send no real mail.

## Consumer-rights panel (`consumerRights.ts`)
- **Brazil (CDC, Lei 8.078/1990)** [LEGAL REVIEW NEEDED]
  - Legal guarantee (art. 26): 90 days (durable) / 30 days (non-durable) to report
    apparent defects, counted from delivery when known, else purchase. Shown as a
    complaint deadline, not a warranty period.
  - Manufacturer warranty: read from the receipt's warranty text, its own end date
    (purchase date + stated months). **Shown side by side; the two are never added
    together** (Hamilton's decision; the research notes some Procons read art. 50
    "complementar" as additive: lawyer question).
  - Notes: hidden defects (art. 26 §3), 30 days to fix then choice (art. 18 §1),
    7-day withdrawal from delivery for online purchases (art. 49).
- **US**: structure only. No legal warranty; retailer return days labelled
  "typical, check with the store"; note that there is no federal minimum.
- **PT/EU** unchanged (3-year / 2-year legal warranty), plus the manufacturer
  warranty card when the receipt states one.
- Return windows count from delivery when known (session 16, item 5).

## Legal documents (`legalDocuments.ts`)
The document registry is scaffolding, not a market-dependent consent flow:
PT (live, English), BR (pt-BR, placeholder), US (en-US, placeholder).
All users still see and accept the existing documents. Market selection does not
switch these documents or claim legal approval.

## Account market (web/PWA only)
- The three markets are `PT` (Portugal / European Union), `BR` and `US`.
  Market is independent of language, actual purchase country, receipt currency
  and subscription currency. Choosing one never rewrites stored receipts.
- **Since 2 Nov 2026 (US mode, Hamilton): the market decides the consumer
  rules.** `US` -> US rules (each store's return policy, online and in store,
  `receipts.return_days` when the user saved one, manufacturer warranty only, no
  legal warranty or statutory return right). `PT`, `BR` or null -> PT/EU rules,
  exactly as before (BR follows PT for now). The receipt's purchase country and
  currency still decide PT/EU/BR/CA rules *inside* the PT path. Server:
  `lib/accountMarket.ts`; web: `lib/region.ts` (reads `MarketProvider`).
- **IP decides the market (Hamilton, 2 Nov 2026).** `GET /api/account/market`
  fills an empty account market from the server-side GeoIP of that request,
  once (`coalesce`, a saved/manual market is never replaced) and returns the
  detected `country` (never stored). A visitor's own landing choice is sent first
  with `onlyIfUnset`, so it wins over the IP. Unknown or uncovered countries leave
  the market empty (PT/EU rules) and show the uncovered-country notice.
- Landing, signed-in home and account settings share the same selector.
  It is available in settings without an active subscription.
- `GET/PATCH /api/account/market` require Clerk authentication (never a guest
  header), but no subscription or new legal-consent requirement. The existing
  account-deletion guard and user-data mutation lock apply.
- Preference is initially null. Updating it changes only the market and update
  timestamp of the preference row, preserving notification opt-out. Existing
  account export/deletion include/remove that row as before.
- Resolution: confirmed account preference, explicit visitor choice, then
  unconfirmed IP suggestion. Browser language never chooses a market. Suggestions
  are not stored as consent or confirmed preferences.
- Visitor choices are local to the browser until login. Adoption uses an atomic
  `onlyIfUnset` write, so an existing account choice wins even in a race.
  The browser-wide choice is consumed on login, never populated from an account.
  An interrupted adoption is retryable in session storage scoped to the original
  account; it is not adopted by a different account. No account-market cache is
  saved in browser-wide storage. Auth changes discard in-flight UI responses.
- A fresh account read runs on scope mount, window focus and returning to a
  visible tab. Failed writes require explicit retry rather than replaying
  silently on reconnect. Location failures do not block browsing.

### Local GeoIP operation and trust boundary
- `GET /api/market/suggestion` accepts **no client-supplied IP parameter**. It
  uses only a public peer address, or walks `X-Forwarded-For` right-to-left
  through explicitly trusted proxy networks. Other IP headers are ignored.
- `geoip-country` includes a maintained, local country-only GeoLite2-derived
  IPv4/IPv6 database. This server endpoint never sends visitor IPs externally. Keep the
  package external to the server bundle: it resolves its data relative to its
  installed package. Missing/corrupt data returns unknown rather than crashing.
- Initial locked data package: `5.0.202610280233` (2026-10-28). Check for updates
  at least monthly and update with
  `pnpm --filter @workspace/api-server update geoip-country --latest`;
  commit the lockfile, run market tests and rebuild/restart the API. Data stays
  in the package installation, not Git. No downloads occur during lookups.
  MaxMind attribution and GeoLite2 licensing apply; see the installed package's
  LICENSE and EULA and https://www.maxmind.com/ for source attribution.
- `MARKET_TRUSTED_PROXY_CIDRS` is an optional comma-separated network allowlist
  (for example, exact internal proxy `/32` or `/128` addresses verified by the
  operator). Default is **empty**, not `trust proxy=true`, not a hop count and
  not an assumption that all private networks are trusted.
- On 2026-10-31 the workspace proxy was probed without retaining or logging IPs:
  peer was loopback and all three forwarded addresses were private/reserved.
  Requests with fabricated public `X-Forwarded-For` values had the same result.
  This path cannot provide a usable public client IP; the local endpoint returns
  unknown. The browser fallback below now supplies a country where possible.
  The temporary diagnostic endpoint was removed.
- Before adding production proxy CIDRs, verify the actual production path
  separately: identify each controlled hop and its append/overwrite behavior;
  test fabricated forwarding headers through every public entry point. Do not
  trust workspace hop counts or undocumented provider headers in production.
  If the provider exposes only internal IPs, leave suggestions unknown.
- Only BR, US and the 27 EU members map to a market. DE/FR/etc suggest PT/EU
  without changing any purchase country. UK, EEA-only countries, unsupported
  countries, private/reserved/invalid IPs and failed lookups return no market.

### No browser-side GeoIP (removed 2 Nov 2026)
- The `api.country.is` browser fallback was removed: no visitor IP is sent to a
  third party. If the server cannot tell the country (no verified public client
  IP), the market stays unknown and the manual selector remains.
- Production needs `MARKET_TRUSTED_PROXY_CIDRS` set to the verified proxy
  network(s) in front of the API, or every lookup stays unknown. Once per
  process the API logs only the *kind* of untrusted peer address
  ("Market GeoIP: no public client IP", `peerRange`), never the address.
- Dev/test only: `MARKET_DEV_COUNTRY=US` (or any ISO code) pretends the request
  came from that country. Ignored when `NODE_ENV=production`.
- The suggestion endpoint keeps `Cache-Control: private, no-store` and its
  bounded global rate budget (600/minute/process).

### Purchase country
- Scan review, email-import review, receipt details and the receipt sheet expose
  the actual ISO-3166-1 alpha-2 country, including Unknown (`null`).
- Manual updates validate real country codes. EU is a market grouping, not a
  purchase country: DE, FR and PT stay distinct. Existing currency/merchant
  rules inference remains an alternative when the country is unknown, not a
  confirmed country or an account preference.
- Country correction uses the existing receipt update, warranty recalculation,
  reminder reset and cache invalidation paths. Existing legal tables are
  unchanged. A PT purchase under a BR account still has PT rules. Under a US
  account every receipt follows the US rules (store policy, manufacturer
  warranty), whatever its purchase country.

## Not done yet
- pt-BR / en-US terms and privacy pages in the app.
- Return-window reminder rules still need review of the unsourced US retailer table.
- BR durable/non-durable classification beyond category.
