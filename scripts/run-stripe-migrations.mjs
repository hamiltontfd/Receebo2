/**
 * Run stripe-replit-sync migrations.
 *
 * Called by the post-merge setup script after task merges.
 * Also run once manually after initial Stripe integration setup.
 *
 * NOTE: We run migrations directly here rather than via runMigrations()
 * because esbuild bundles break __dirname resolution for the migrations directory.
 */

import { readFileSync, readdirSync } from "fs";
import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set — skipping Stripe migrations");
  process.exit(0);
}

const migrationsDir = new URL(
  "../node_modules/.pnpm/stripe-replit-sync@1.0.0_stripe@22.3.2_@types+node@25.6.2_/node_modules/stripe-replit-sync/dist/migrations",
  import.meta.url,
).pathname;

let files;
try {
  files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
} catch {
  console.error("stripe-replit-sync migrations directory not found — skipping");
  process.exit(0);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

await client.query("CREATE SCHEMA IF NOT EXISTS stripe;");
await client.query(`
  CREATE TABLE IF NOT EXISTS stripe."_migrations" (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`);

const res = await client.query('SELECT name FROM stripe."_migrations" ORDER BY id;');
const appliedSet = new Set(res.rows.map(r => r.name));
console.log(`Stripe migrations: ${appliedSet.size} already applied`);

let ran = 0;
let skipped = 0;
for (const file of files) {
  if (appliedSet.has(file)) { skipped++; continue; }
  const sql = readFileSync(`${migrationsDir}/${file}`, "utf8").trim();
  if (!sql || sql === "select 1;") {
    await client.query(`INSERT INTO stripe."_migrations" (name) VALUES ($1) ON CONFLICT DO NOTHING;`, [file]);
    skipped++;
    continue;
  }
  await client.query(sql);
  await client.query(`INSERT INTO stripe."_migrations" (name) VALUES ($1) ON CONFLICT DO NOTHING;`, [file]);
  ran++;
  console.log(`Applied: ${file}`);
}
await client.end();
console.log(`Stripe migrations done. Applied: ${ran}, Skipped: ${skipped}`);
