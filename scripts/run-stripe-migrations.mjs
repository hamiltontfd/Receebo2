/**
 * Run stripe-replit-sync schema migrations.
 *
 * This script is intentionally standalone (not bundled with the API server)
 * because esbuild rewrites __dirname to a virtual path inside the bundle,
 * which causes stripe-replit-sync's runMigrations() to silently skip the
 * migration files.  Spawning this as a child process from initStripe()
 * preserves correct import.meta.url / require.resolve() resolution.
 *
 * Exit codes:
 *   0 — all migrations applied (or already applied)
 *   1 — failure (stripe-replit-sync not found, migrations dir missing, SQL error)
 *
 * Usage: node scripts/run-stripe-migrations.mjs
 * Requires DATABASE_URL in the environment.
 */

import { createRequire } from "module";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

// ──────────────────────────────────────────────────────────────────────────────
// Locate the stripe-replit-sync migrations directory via require.resolve so
// that the path is resilient to pnpm layout changes (no hard-coded store path).
// ──────────────────────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);

let migrationsDir;
try {
  const pkgJsonPath = require.resolve("stripe-replit-sync/package.json");
  migrationsDir = path.join(path.dirname(pkgJsonPath), "dist", "migrations");
} catch (err) {
  console.error(
    "ERROR: Could not resolve stripe-replit-sync package:",
    err.message,
  );
  process.exit(1);
}

let files;
try {
  files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
} catch (err) {
  console.error(
    "ERROR: stripe-replit-sync migrations directory not found at",
    migrationsDir,
    "—",
    err.message,
  );
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// Apply migrations
// ──────────────────────────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL not set — cannot run Stripe migrations");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
} catch (err) {
  console.error("ERROR: Could not connect to database:", err.message);
  process.exit(1);
}

try {
  await client.query("CREATE SCHEMA IF NOT EXISTS stripe;");
  await client.query(`
    CREATE TABLE IF NOT EXISTS stripe."_migrations" (
      id         serial PRIMARY KEY,
      name       text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const res = await client.query(
    'SELECT name FROM stripe."_migrations" ORDER BY id;',
  );
  const appliedSet = new Set(res.rows.map((r) => r.name));
  console.log(`Stripe migrations: ${appliedSet.size} already applied`);

  let ran = 0;
  let skipped = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped++;
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, file), "utf8").trim();
    if (!sql || sql === "select 1;") {
      await client.query(
        `INSERT INTO stripe."_migrations" (name) VALUES ($1) ON CONFLICT DO NOTHING;`,
        [file],
      );
      skipped++;
      continue;
    }
    await client.query(sql);
    await client.query(
      `INSERT INTO stripe."_migrations" (name) VALUES ($1) ON CONFLICT DO NOTHING;`,
      [file],
    );
    ran++;
    console.log(`Applied: ${file}`);
  }

  console.log(
    `Stripe migrations done. Applied: ${ran}, Skipped: ${skipped}`,
  );
} catch (err) {
  console.error("ERROR: Stripe migration failed:", err.message);
  await client.end().catch(() => {});
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
