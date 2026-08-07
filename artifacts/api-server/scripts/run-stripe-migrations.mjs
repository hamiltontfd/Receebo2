#!/usr/bin/env node
/**
 * Standalone script that runs stripe-replit-sync schema migrations.
 *
 * Spawned as a child process by the API server on startup so that
 * stripe-replit-sync's use of __dirname (which esbuild rewrites to a
 * virtual path inside the bundle) resolves correctly against the real
 * node_modules directory.
 */
import { runMigrations } from "stripe-replit-sync";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("run-stripe-migrations: DATABASE_URL is not set");
  process.exit(1);
}

try {
  await runMigrations({ databaseUrl });
  console.log("run-stripe-migrations: done");
  process.exit(0);
} catch (err) {
  console.error("run-stripe-migrations: failed", err);
  process.exit(1);
}
