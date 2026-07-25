---
name: stripe-replit-sync esbuild migration path break
description: stripe-replit-sync runMigrations fails silently in esbuild bundles due to __dirname resolution; connector secret key field name is "secret" not "secret_key"
---

# stripe-replit-sync in esbuild bundles

## The rule
Never call `runMigrations()` from inside an esbuild-bundled server. Run migrations via a standalone Node `.mjs` script that is NOT bundled.

**Why:** `runMigrations` resolves its migration directory with `path.resolve(__dirname, "./migrations")`. esbuild rewrites `__dirname` to a virtual path inside the bundle, so the directory is never found and migrations silently skip.

**How to apply:** Keep a `scripts/run-stripe-migrations.mjs` at workspace root. Call it from the post-merge setup and from `initStripe` startup logic if needed. The bundled server should assume migrations are already applied.

## Stripe connector secret field name
The Replit Stripe connector exposes the API key as `settings.secret`, NOT `settings.secret_key`. Always read `settings?.secret ?? settings?.secret_key` for forwards compat.

## Version pinning
Use `stripe@^22.x` and `stripe-replit-sync@^1.0.0` together. The `^0.0.10` version of stripe-replit-sync is incompatible with stripe v22 and has different table schemas (missing `stripe.accounts`, `stripe._managed_webhooks`, etc.).
