/**
 * Cookie choices for attribution and Meta ads.
 * DRAFT pending legal review — counsel should confirm the EU opt-in and the
 * California opt-out / Global Privacy Control behaviour before this is treated
 * as final policy.
 */
export type ConsentRegion = "US" | "EU";

export type ConsentState = {
  essential: true;
  preferences: boolean;
  attribution: boolean;
  marketing: boolean;
  /** Set when the person used the banner. Absent means no stored choice. */
  choice?: "accept" | "reject" | "preferences";
  updatedAt: string;
};

export const CONSENT_STORAGE_KEY = "receebo:cookie-consent";
const NINETY_DAYS = 90 * 24 * 60 * 60;

export function consentRegion(path: string, market: string | null | undefined): ConsentRegion {
  if (path === "/us" || path.startsWith("/us/") || market === "US") return "US";
  return "EU";
}

export function emptyConsent(now = new Date().toISOString()): ConsentState {
  return { essential: true, preferences: false, attribution: false, marketing: false, choice: "reject", updatedAt: now };
}

export function acceptAll(now = new Date().toISOString()): ConsentState {
  return { essential: true, preferences: true, attribution: true, marketing: true, choice: "accept", updatedAt: now };
}

/** What is allowed before or without a stored banner choice. */
export function effectiveConsent(
  stored: ConsentState | null,
  region: ConsentRegion,
  globalPrivacyControl: boolean,
): ConsentState {
  if (stored?.choice) return stored;
  if (region === "EU") return emptyConsent();
  return {
    essential: true,
    preferences: true,
    attribution: true,
    marketing: !globalPrivacyControl,
    updatedAt: stored?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function parseConsent(raw: string | null): ConsentState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentState>;
    if (value.essential !== true || !value.choice || !value.updatedAt) return null;
    return {
      essential: true,
      preferences: value.preferences === true,
      attribution: value.attribution === true,
      marketing: value.marketing === true,
      choice: value.choice,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

export function consentCookie(state: ConsentState): string {
  return `${CONSENT_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${NINETY_DAYS}; SameSite=Lax`;
}
