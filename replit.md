# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

### Mandatory pre-publish login gate

Before **every production publish**, run `pnpm run test:login-gate` against the
current Replit DEV preview candidate. A failure blocks publishing; rerun after
any candidate changes. This is a manual pre-publish requirement, not a scheduler
or an automatic hook into Replit's Publish button.

The command first runs only the Clerk proxy unit tests with an isolated Vitest
config (no database setup), then signed-out desktop/mobile browser checks.
It must not target production. The origin defaults to `https://$REPLIT_DEV_DOMAIN`;
`LOGIN_GATE_ORIGIN` can override it for the DEV preview. Do not set
`LOGIN_GATE_ALLOW_PROD=1` during release checks (it is an explicit safety override).
DEV opts into the same first-party proxy path as production via development-only
`CLERK_PROXY_ENABLED=1` and `VITE_CLERK_PROXY_URL=/api/__clerk`. The API still
requires its existing Clerk key. Production remains enabled independently of
this flag. The browser gate requires the Clerk bundles, requested npm chunks,
environment and client requests to succeed through the DEV `/api/__clerk` proxy;
direct Clerk requests cannot pass. No real login is submitted.
Changing these settings requires starting/restarting the services to load them.
Do not do that without approval: API startup executes migrations and backfills.
Screenshots are saved under `generated-artifacts/login-gate`.
`LOGIN_GATE_FAIL_DEMO=1 pnpm run test:login-gate` must fail against a temporary
local broken-login page; alternatively run
`pnpm --filter @workspace/receiptr run test:login-gate --fail-demo`.
Use `CHROMIUM_PATH` or `PWA_CHROMIUM_PATH` if Chromium is not auto-detected.

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
