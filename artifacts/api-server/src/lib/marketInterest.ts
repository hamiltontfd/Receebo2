/**
 * "I'm interested" for countries Receebo doesn't cover yet (Hamilton, 2 Nov 2026:
 * "ter um fallback para deixar eles clicarem num botão e dizerem que têm
 * interesse. (podemos medir isso)").
 *
 * Aggregate only: one row per ISO country with a running count. No user id, no
 * IP, no user agent, no timestamp per click. Additive startup migration.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { isCoveredCountry } from "./marketGeoip";
import { validPurchaseCountry } from "./purchaseCountry";

export async function migrateMarketInterestCounts(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS market_interest_counts (
      country text PRIMARY KEY CHECK (country ~ '^[A-Z]{2}$'),
      count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
}

/** A real ISO country that Receebo doesn't cover yet, or null. */
export function interestCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || !validPurchaseCountry(code) || isCoveredCountry(code)) return null;
  return code;
}

export async function recordMarketInterest(country: string): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO market_interest_counts (country, count, updated_at) VALUES (${country}, 1, now())
    ON CONFLICT (country) DO UPDATE SET count = market_interest_counts.count + 1, updated_at = now()
    RETURNING count`);
  return Number((result.rows[0] as { count: number }).count);
}

/** Read-only report (no per-person data exists to report). */
export async function marketInterestReport(): Promise<Array<{ country: string; count: number; updatedAt: string }>> {
  const result = await db.execute(sql`SELECT country, count, updated_at FROM market_interest_counts ORDER BY count DESC, country`);
  return (result.rows as Array<{ country: string; count: number; updated_at: Date | string }>).map((r) => ({
    country: r.country, count: Number(r.count), updatedAt: new Date(r.updated_at).toISOString(),
  }));
}
