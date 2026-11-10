import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Additive table for the origin of a trial. Created on API startup with
 * IF NOT EXISTS. No backfill. Existing accounts stay without a row until the
 * browser sends a first touch after sign-up.
 * DRAFT pending legal review.
 */
export async function migrateAdAttribution(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ad_attributions (
      user_id text PRIMARY KEY,
      utm_source text,
      utm_medium text,
      utm_campaign text,
      utm_content text,
      utm_term text,
      fbclid text,
      fbc text,
      fbp text,
      marketing_consent boolean NOT NULL DEFAULT false,
      captured_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

export type StoredTouch = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  marketingConsent: boolean;
  capturedAt?: string;
};

/** Inserts the first touch only. A second call does not replace it. */
export async function saveFirstTouch(userId: string, touch: StoredTouch): Promise<{ created: boolean }> {
  const inserted = await db.execute(sql`
    INSERT INTO ad_attributions (
      user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, fbc, fbp, marketing_consent, captured_at
    ) VALUES (
      ${userId}, ${touch.utmSource ?? null}, ${touch.utmMedium ?? null}, ${touch.utmCampaign ?? null},
      ${touch.utmContent ?? null}, ${touch.utmTerm ?? null}, ${touch.fbclid ?? null}, ${touch.fbc ?? null},
      ${touch.fbp ?? null}, ${touch.marketingConsent}, ${touch.capturedAt ? new Date(touch.capturedAt) : null}
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id`);
  const rows = Array.isArray(inserted) ? inserted : (inserted as { rows?: unknown[] }).rows ?? [];
  return { created: rows.length > 0 };
}

export async function marketingConsentFor(userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT marketing_consent FROM ad_attributions WHERE user_id = ${userId}`);
  const rows = (Array.isArray(result) ? result : (result as { rows?: { marketing_consent?: boolean }[] }).rows ?? []) as { marketing_consent?: boolean }[];
  if (!rows.length) return false;
  return rows[0].marketing_consent === true;
}
