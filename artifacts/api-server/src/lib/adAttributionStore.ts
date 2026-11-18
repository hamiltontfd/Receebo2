import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Additive table for the origin of a trial. Created on API startup with
 * IF NOT EXISTS. No backfill. A normal account consent change may create a
 * consent-only row; first-touch fields are filled once when supplied later.
 * First-touch campaign fields and the account's latest marketing choice.
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

/** Records the first touch, including after a consent-only row; never replaces a real touch or its latest consent. */
export async function saveFirstTouch(userId: string, touch: StoredTouch): Promise<{ created: boolean }> {
  const inserted = await db.execute(sql`
    INSERT INTO ad_attributions (
      user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, fbc, fbp, marketing_consent, captured_at
    ) VALUES (
      ${userId}, ${touch.utmSource ?? null}, ${touch.utmMedium ?? null}, ${touch.utmCampaign ?? null},
      ${touch.utmContent ?? null}, ${touch.utmTerm ?? null}, ${touch.fbclid ?? null}, ${touch.fbc ?? null},
      ${touch.fbp ?? null}, ${touch.marketingConsent}, ${touch.capturedAt ? new Date(touch.capturedAt) : new Date()}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      utm_source = EXCLUDED.utm_source, utm_medium = EXCLUDED.utm_medium,
      utm_campaign = EXCLUDED.utm_campaign, utm_content = EXCLUDED.utm_content,
      utm_term = EXCLUDED.utm_term, fbclid = EXCLUDED.fbclid,
      fbc = EXCLUDED.fbc, fbp = EXCLUDED.fbp, captured_at = EXCLUDED.captured_at
    WHERE ad_attributions.captured_at IS NULL
      AND ad_attributions.utm_source IS NULL AND ad_attributions.utm_medium IS NULL
      AND ad_attributions.utm_campaign IS NULL AND ad_attributions.utm_content IS NULL
      AND ad_attributions.utm_term IS NULL AND ad_attributions.fbclid IS NULL
      AND ad_attributions.fbc IS NULL AND ad_attributions.fbp IS NULL
    RETURNING user_id`);
  const rows = Array.isArray(inserted) ? inserted : (inserted as { rows?: unknown[] }).rows ?? [];
  return { created: rows.length > 0 };
}

/** Only the current authenticated account; preserve every first-touch field. No backfill. */
export async function updateMarketingConsent(userId: string, allowed: boolean): Promise<void> {
  await db.execute(sql`
    INSERT INTO ad_attributions (user_id, marketing_consent) VALUES (${userId}, ${allowed})
    ON CONFLICT (user_id) DO UPDATE SET marketing_consent = EXCLUDED.marketing_consent`);
}

export async function marketingConsentFor(userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT marketing_consent FROM ad_attributions WHERE user_id = ${userId}`);
  const rows = (Array.isArray(result) ? result : (result as { rows?: { marketing_consent?: boolean }[] }).rows ?? []) as { marketing_consent?: boolean }[];
  if (!rows.length) return false;
  return rows[0].marketing_consent === true;
}

/** Matching identifiers only; the caller has already checked current marketing consent. */
export type StoredMetaIdentifiers = { fbc?: string; fbp?: string; fbcSource: "stored" | "built" | "none" };

export async function metaIdentifiersFor(userId: string): Promise<StoredMetaIdentifiers> {
  const result = await db.execute(sql`
    SELECT fbc, fbp, fbclid, captured_at FROM ad_attributions WHERE user_id = ${userId}`);
  const rows = (Array.isArray(result) ? result : result.rows ?? []) as Array<{
    fbc: string | null; fbp: string | null; fbclid: string | null; captured_at: Date | string | null;
  }>;
  return storedMetaIdentifiers(rows[0]);
}

export function storedMetaIdentifiers(touch?: {
  fbc?: string | null; fbp?: string | null; fbclid?: string | null; captured_at?: Date | string | null;
}): StoredMetaIdentifiers {
  const captured = touch?.captured_at == null ? NaN : new Date(touch.captured_at).getTime();
  const fbc = touch?.fbc || (touch?.fbclid && Number.isFinite(captured)
    ? `fb.1.${captured}.${touch.fbclid}` : undefined);
  return {
    ...(fbc ? { fbc } : {}), ...(touch?.fbp ? { fbp: touch.fbp } : {}),
    fbcSource: touch?.fbc ? "stored" : fbc ? "built" : "none",
  };
}
