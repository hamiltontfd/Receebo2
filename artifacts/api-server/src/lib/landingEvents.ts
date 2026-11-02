/**
 * Landing measurement (US mode D, Hamilton 2 Nov 2026): aggregate counts only.
 * One row per (UTC day, event, landing path, utm_content) with a running count.
 * No user id, no IP, no user agent, no referrer, no per-visit row, and nothing
 * is stored in the browser. Additive startup migration.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export const LANDING_EVENTS = ["landing_view", "cta_click"] as const;
export type LandingEvent = (typeof LANDING_EVENTS)[number];
export const LANDING_PATHS = ["/", "/us"] as const;
export const NO_UTM = "(none)";
export const OTHER_UTM = "(other)";

export async function migrateLandingEventCounts(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS landing_event_counts (
      day date NOT NULL,
      event text NOT NULL CHECK (event IN ('landing_view', 'cta_click')),
      path text NOT NULL CHECK (path IN ('/', '/us')),
      utm_content text NOT NULL CHECK (char_length(utm_content) BETWEEN 1 AND 40),
      count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
      PRIMARY KEY (day, event, path, utm_content)
    )`);
}

export type LandingEventInput = { event: LandingEvent; path: (typeof LANDING_PATHS)[number]; utmContent: string };

/**
 * Validate a beacon. utm_content is an ad label we choose ourselves: lowercase
 * letters, digits, "-" and "_", up to 40 chars. Anything else is counted as
 * "(other)" so free text (an email, a name) can never be stored.
 */
export function parseLandingEvent(body: unknown): LandingEventInput | null {
  if (!body || typeof body !== "object") return null;
  const { event, path, utmContent } = body as Record<string, unknown>;
  if (typeof event !== "string" || !(LANDING_EVENTS as readonly string[]).includes(event)) return null;
  if (typeof path !== "string" || !(LANDING_PATHS as readonly string[]).includes(path)) return null;
  let utm = NO_UTM;
  if (typeof utmContent === "string" && utmContent.trim() !== "") {
    const value = utmContent.trim().toLowerCase();
    utm = /^[a-z0-9_-]{1,40}$/.test(value) ? value : OTHER_UTM;
  }
  return { event: event as LandingEvent, path: path as LandingEventInput["path"], utmContent: utm };
}

export async function recordLandingEvent(input: LandingEventInput, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO landing_event_counts (day, event, path, utm_content, count)
    VALUES (${day}, ${input.event}, ${input.path}, ${input.utmContent}, 1)
    ON CONFLICT (day, event, path, utm_content) DO UPDATE SET count = landing_event_counts.count + 1`);
}

export async function landingEventReport(): Promise<Array<{ day: string; event: string; path: string; utmContent: string; count: number }>> {
  const result = await db.execute(sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, event, path, utm_content, count
    FROM landing_event_counts ORDER BY day DESC, path, event, count DESC, utm_content`);
  return (result.rows as Array<{ day: string; event: string; path: string; utm_content: string; count: number }>).map((r) => ({
    day: r.day, event: r.event, path: r.path, utmContent: r.utm_content, count: Number(r.count),
  }));
}
