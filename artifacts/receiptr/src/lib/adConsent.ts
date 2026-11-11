/**
 * Cookie choices for attribution and Meta ads.
 * DRAFT pending legal review — counsel should confirm the EU opt-in and the
 * California opt-out / Global Privacy Control behaviour before this is treated
 * as final policy.
 */
export type ConsentRegion = "US" | "EU" | "UNKNOWN";

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

export const CONSENT_CHANGED = "receebo:consent-changed";

/** Only the actual request country determines jurisdiction, never route or market. */
export function consentRegion(country: string | null | undefined): ConsentRegion {
  if (!country) return "UNKNOWN";
  return country.toUpperCase() === "US" ? "US" : "EU";
}

export function consentCountry(country: string | null | undefined, search = window.location.search, dev = import.meta.env.DEV): string | null {
  const override = dev ? new URLSearchParams(search).get("dev_country")?.toUpperCase() : null;
  return override && /^[A-Z]{2}$/.test(override) ? override : country ?? null;
}

export function readStoredConsent(): ConsentState | null {
  try { return parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY)); } catch { return null; }
}

export function emptyConsent(now = new Date().toISOString()): ConsentState {
  return { essential: true, preferences: false, attribution: false, marketing: false, choice: "reject", updatedAt: now };
}

export function acceptAll(now = new Date().toISOString()): ConsentState {
  return { essential: true, preferences: true, attribution: true, marketing: true, choice: "accept", updatedAt: now };
}

/** Explicit saved choices take precedence over jurisdiction/GPC defaults. */
export function effectiveConsent(
  stored: ConsentState | null,
  region: ConsentRegion,
  globalPrivacyControl: boolean,
): ConsentState {
  if (stored?.choice) return stored;
  if (region === "UNKNOWN") return emptyConsent();
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
  return `${CONSENT_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${NINETY_DAYS}; SameSite=Lax; Secure`;
}
