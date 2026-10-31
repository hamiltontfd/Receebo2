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
  Emails are a separate server localization surface, not changed by this work.
  The selector discloses these boundaries rather than claiming those contents
  are translated. Switching language does not remount forms or clear draft edits.
- Signed-in preferences are stored per account, available without subscription.
  Null means automatic browser language. Visitors save only to this browser.
  Visitor choices are never imported into accounts; accounts never write their
  language into browser-wide storage. Signing out restores the visitor choice.
  Language never changes market, purchase country, receipt/subscription currency,
  or the legal rules applied to a purchase.
- `en`, `pt-PT`, `pt-BR`. Fallback: pt-BR → pt-BR, other pt → pt-PT, else en.
- `getAppLocale()` reads the active account language (or browser language in
  automatic mode), independently of market and purchase country. Signed-out
  visitors retain the existing `localStorage["receebo:locale"]` preference.
- The public landing page, including FAQ, pricing, navigation and media
  explanations, and shared market selectors have English, pt-PT and pt-BR copy.
  Consumer-rights copy also uses that locale. Screenshot/video content remains
  in its recorded language and Portuguese captions disclose English recordings.
- Compact market selectors show the inferred market code immediately when
  available. Suggestions remain unconfirmed, with confirmation inside the menu;
  nothing opens automatically. Unknown location uses a neutral region control,
  not a fabricated Portugal selection.
- Dates/money follow the email spec table (en "Dec 12, 2026" / "€449.00";
  pt-PT "12 dez 2026" / "449,00 €"; pt-BR "12 de dez. de 2026" / "€ 449,00").

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
  and subscription currency. Choosing one never rewrites receipts or rules.
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

### Authorized browser-side GeoIP fallback
- After the owner authorized an external IP lookup, the browser uses
  `https://api.country.is/` only when no confirmed account/browser preference
  exists and the local suggestion cannot determine a country (including API
  failure). A known but unsupported local country does not trigger another lookup.
- The call must run in the **browser**, not the backend: otherwise it would
  locate the server. Use only the caller endpoint, without an IP parameter,
  credentials or referrer. No account identifier, receipt content or app cookie
  is sent. As with any network request, country.is receives the caller's public IP.
- Read only `country`; discard the returned IP and all other fields. Validate a
  real ISO code and map the same EU/BR/US markets as the local database. A valid
  unsupported country remains unknown, never PT.
- Successful country/market results are cached in memory for ten minutes only
  to avoid repeat calls on focus, not in local/session storage or server logs.
  The cache is geographic data, never a confirmed account or visitor preference.
  Requests have a three-second deadline and are cancelled on scope changes.
- Blocked CORS, rate limits, ad blockers, invalid payloads and offline conditions
  retain manual choice and recoverable retry. No lookup blocks navigation, saves
  a suggestion as confirmation, or overrides a manual/account preference.
- The provider is disclosed in the selector explanation and Privacy Policy.
  No new legal consent version, local legal-document claims, or billing changes
  were introduced. Public endpoint documentation: https://country.is/.
- The local server endpoint's responses use `Cache-Control: private, no-store`. It has a bounded
  global rate budget (600/minute/process), with no per-IP map or retained IP
  keys. Exhaustion is a recoverable unavailable suggestion, not a default PT.
  Neither this route nor its request serializer logs IPs or forwarding headers.

### Purchase country
- Scan review, email-import review, receipt details and the receipt sheet expose
  the actual ISO-3166-1 alpha-2 country, including Unknown (`null`).
- Manual updates validate real country codes. EU is a market grouping, not a
  purchase country: DE, FR and PT stay distinct. Existing currency/merchant
  rules inference remains an alternative when the country is unknown, not a
  confirmed country or an account preference.
- Country correction uses the existing receipt update, warranty recalculation,
  reminder reset and cache invalidation paths. Existing legal tables are
  unchanged. A PT purchase under a BR account still has PT rules; a BR purchase
  under a US account still has the existing BR rules and legal-review caveats.

## Not done yet
- pt-BR / en-US terms and privacy pages in the app.
- Return-window reminder rules still need review of the unsourced US retailer table.
- BR durable/non-durable classification beyond category.
