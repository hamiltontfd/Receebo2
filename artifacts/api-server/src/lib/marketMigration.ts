import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Nullable, compatible with existing notification rows. No receipt backfill. */
export async function migrateAccountMarket(): Promise<void> {
  await db.execute(sql`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS market text
    CHECK (market IS NULL OR market IN ('PT', 'BR', 'US'))`);
  await db.execute(sql`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS language text
    CHECK (language IS NULL OR language IN ('en', 'pt-PT', 'pt-BR'))`);
}
