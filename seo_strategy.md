# SEO Strategy

## In scope
- Receebo public landing page (`/`), privacy and terms pages, and public sign-in/sign-up entry points.
- Public web delivery, share metadata, crawler visibility, brand assets, and source-detectable WCAG 2.2 A/AA accessibility.

## Out of scope
- Authenticated receipt-management, billing, admin and settings screens.
- Native mobile internals and its Expo Go installation gateway, and the internal mockup sandbox (not search landing pages).

## Target audience
- Consumers who want to scan, import, organise and find purchase receipts and track return and warranty dates.
- Public copy supports English and Portuguese (Portugal/Brazil); language is managed independently of market.

## Primary topics
- Receipt organiser, receipt scanning, Outlook receipt import, purchase search, return and warranty reminders.

## Rendering and crawler assumptions
- Main web app uses Vite/React client rendering with static production hosting and a catch-all HTML rewrite. Public content should be discoverable by search engines, social preview bots and AI retrieval crawlers; no intentional AI crawler exclusion is recorded.
- Source configuration uses https://receebo.net as the public origin.
- There is no editorial/blog or large programmatic content library in the current source. App-private routes should not be added to public sitemaps.

## Dismissed categories
- None recorded.
