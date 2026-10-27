import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { guardPoolErrors } from "./poolErrors";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = guardPoolErrors(new Pool({ connectionString: process.env.DATABASE_URL }), "app");
export const advisoryLockPool = guardPoolErrors(
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
  }),
  "advisory-lock",
);
export const db = drizzle(pool, { schema });

export * from "./schema";
export { guardPoolErrors, connectGuarded, type GuardedClient, type PoolErrorLog } from "./poolErrors";
