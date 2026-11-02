# Public page delivery

`vite build` renders `/`, `/privacy`, and `/terms` from the existing React
components. The generated HTML includes each page's body and route-specific
canonical, description, Open Graph and Twitter metadata. The same build emits
`sitemap.xml`, `robots.txt`, a noindex `app.html` for client-only screens, and a
branded `404.html`. `VITE_APP_URL` controls the production origin (default:
`https://receebo.net`); do not use the development host for canonical URLs.

The initial public snapshot is English and has no session/API dependencies.
The browser hydrates it, then loads the existing app with its normal Clerk,
language, market and guest providers. Browser/account language and all existing
authentication and receipt flows resume after hydration. The snapshot keeps
content visible while that app bundle loads. FAQ answers remain in the HTML
even when their accordion panels are closed. Entrance-animation styles cannot
hide the public snapshot when JavaScript is disabled.

Production uses `scripts/serve-public.mjs` instead of a catch-all static rewrite.
It serves only the three public documents, actual static files, and explicitly
allowed client routes. Unknown paths return HTTP 404 plus noindex, not the
homepage. The API artifact still owns `/api`; this web process does not import
the API server or start integration jobs. Keep the client-route allowlist in
sync when adding screens to `App.tsx`.

Verification:

```sh
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/receiptr build
pnpm --filter @workspace/receiptr test:seo
```

These checks exercise the built documents and real production HTTP handler,
including metadata, FAQ/pricing text, sitemap MIME type, client deep links,
404 status, redirects, HEAD, media ranges and PWA precache entries.
