import { db, userPreferencesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { normalizeCountryCode } from "./purchaseCountry";
import { logger } from "./logger";

export async function getAccountCountry(userId: string): Promise<string | null> {
  const [row] = await db.select({ country: userPreferencesTable.country })
    .from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId)).limit(1);
  return normalizeCountryCode(row?.country);
}

/** Called only after legal consent. Unknown GeoIP never creates a row. */
export async function countryForRequest(userId: string, detected: string | null): Promise<string | null> {
  const country = normalizeCountryCode(detected);
  try {
    const saved = await getAccountCountry(userId);
    if (saved || !country) return saved;
    const [row] = await db.insert(userPreferencesTable).values({ userId, country })
      .onConflictDoUpdate({
        target: userPreferencesTable.userId,
        set: { country: sql`coalesce(${userPreferencesTable.country}, ${country})`, updatedAt: new Date() },
      }).returning({ country: userPreferencesTable.country });
    return normalizeCountryCode(row?.country) ?? country;
  } catch (err) {
    logger.warn({ err }, "Could not save account country; using request country only");
    return country;
  }
}

/** Batch-scoped, never a persistent cache: manual corrections apply on the next sweep. */
export function accountCountryLookup(): (userId: string) => Promise<string | null> {
  const cache = new Map<string, Promise<string | null>>();
  return (userId) => {
    let hit = cache.get(userId);
    if (!hit) {
      hit = getAccountCountry(userId).catch(() => null);
      cache.set(userId, hit);
    }
    return hit;
  };
}
