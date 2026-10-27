/**
 * Legal documents per market (structure only).
 *
 * One complete document per market and language, chosen by the account's
 * country (not IP). Only the current EU/PT documents (English, /terms and
 * /privacy) are live. Brazil and the US are placeholders: drafts exist outside
 * the repo (/workspace/receebo/legal/) and need a lawyer before anything ships.
 * [LEGAL REVIEW NEEDED]
 */
import type { AppLocale } from "./locale";

export type LegalMarket = "PT" | "BR" | "US";
export type LegalDocumentStatus = "live" | "placeholder";

export interface LegalMarketDocuments {
  market: LegalMarket;
  locale: AppLocale | "en-US";
  status: LegalDocumentStatus;
  termsPath: string;
  privacyPath: string;
  /** Laws the market document must cover (from the BR/US research). */
  mustCover: string[];
  note: string;
}

export const LEGAL_DOCUMENTS: Record<LegalMarket, LegalMarketDocuments> = {
  PT: {
    market: "PT", locale: "en", status: "live", termsPath: "/terms", privacyPath: "/privacy",
    mustCover: ["GDPR", "DL 24/2014", "DL 84/2021", "Lei 144/2015 (ADR)"],
    note: "Current documents. A pt-PT translation is still to do.",
  },
  BR: {
    market: "BR", locale: "pt-BR", status: "placeholder", termsPath: "/terms", privacyPath: "/privacy",
    mustCover: ["CDC (Lei 8.078/1990)", "Decreto 7.962/2013", "LGPD (Lei 13.709/2018)"],
    note: "[LEGAL REVIEW NEEDED] pt-BR terms and privacy policy not written into the app. Brazilian users see the current documents.",
  },
  US: {
    market: "US", locale: "en-US", status: "placeholder", termsPath: "/terms", privacyPath: "/privacy",
    mustCover: ["Magnuson-Moss (disclosure only)", "CalOPPA", "California ARL / ROSCA (auto-renewal)"],
    note: "[LEGAL REVIEW NEEDED] en-US terms and privacy policy not written into the app. US users see the current documents.",
  },
};

/** Market for a purchase or account country code; anything outside BR/US uses the current PT/EU documents. */
export function legalMarketFor(country: string | null | undefined): LegalMarket {
  const code = (country ?? "").toUpperCase();
  return code === "BR" || code === "US" ? code : "PT";
}
