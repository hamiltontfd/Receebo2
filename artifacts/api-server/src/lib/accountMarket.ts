/**
 * Account market (Replit's `user_preferences.market`: PT | BR | US | null) is
 * the single source for which consumer rules an account follows (US mode,
 * Hamilton 2 Nov 2026: "O IP deve determinar o mercado").
 *
 * - US            -> US rules (store return policies, also in store; no legal warranty).
 * - PT, BR, null  -> PT/EU rules, exactly today's behaviour (BR follows PT for now).
 *
 * A signed-in account without a market gets one from the server-side GeoIP
 * lookup of the current request, once (never overwrites a saved market). The
 * IP itself is never stored or logged. Settings can change it any time.
 */
import { eq, sql } from "drizzle-orm";
import { db, userPreferencesTable } from "@workspace/db";
import type { Market } from "./marketGeoip";

export type RulesRegion = "PT" | "US";

export function rulesRegionForMarket(market: unknown): RulesRegion {
  return market === "US" ? "US" : "PT";
}

export async function getAccountMarket(userId: string): Promise<Market | null> {
  const [row] = await db.select({ market: userPreferencesTable.market })
    .from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId)).limit(1);
  const m = row?.market;
  return m === "PT" || m === "BR" || m === "US" ? m : null;
}

/** Per-run cache for sweeps and email batches (one query per user). Read errors fall back to PT rules. */
export function accountRegionLookup(): (userId: string) => Promise<RulesRegion> {
  const cache = new Map<string, Promise<RulesRegion>>();
  return (userId: string) => {
    let hit = cache.get(userId);
    if (!hit) {
      hit = getAccountMarket(userId).then(rulesRegionForMarket).catch(() => "PT" as const);
      cache.set(userId, hit);
    }
    return hit;
  };
}

/** First write wins: only fills an empty market (a saved or manual choice is never replaced). */
export async function setMarketIfUnset(userId: string, market: Market): Promise<Market | null> {
  const [saved] = await db.insert(userPreferencesTable).values({ userId, market })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: { market: sql`coalesce(${userPreferencesTable.market}, ${market})`, updatedAt: new Date() },
    }).returning({ market: userPreferencesTable.market });
  const m = saved?.market;
  return m === "PT" || m === "BR" || m === "US" ? m : null;
}
