import { db, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type EmailLocale = "en" | "pt-PT" | "pt-BR";

/** Background sends have no browser. Missing/unsupported => English; never
 * infer language from market, purchase country, currency or the server. */
export function resolveEmailLocale(language: unknown): EmailLocale {
  return language === "pt-PT" || language === "pt-BR" ? language : "en";
}

/**
 * Email language (Hamilton, 2 Nov 2026): the manual choice in Settings, else
 * the browser language the signed-in app reported (detected_language), else
 * English.
 */
export function emailLocaleFrom(prefs: { language?: unknown; detectedLanguage?: unknown } | null | undefined): EmailLocale {
  if (prefs?.language === "en" || prefs?.language === "pt-PT" || prefs?.language === "pt-BR") return prefs.language;
  return resolveEmailLocale(prefs?.detectedLanguage);
}

export async function getUserEmailLocale(userId: string): Promise<EmailLocale> {
  if (userId.startsWith("guest_")) return "en";
  const [preferences] = await db.select({
    language: userPreferencesTable.language, detectedLanguage: userPreferencesTable.detectedLanguage,
  }).from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
  // A failed read must reject, not silently send in the wrong language.
  return emailLocaleFrom(preferences);
}

export function emailLabels(locale: EmailLocale = "en") {
  return locale === "en" ? {
    view: "View receipt", manage: "Manage reminders", unsubscribe: "Unsubscribe",
    unsubscribeRest: "from warranty and return reminders, or manage preferences in your",
    settings: "settings", questions: "Questions? Email", operated: "operated by",
  } : {
    view: "Ver recibo", manage: "Gerir lembretes", unsubscribe: "Cancelar lembretes",
    unsubscribeRest: "de garantia e devolução, ou alterar as preferências nas",
    settings: "definições", questions: "Dúvidas? Escreva para", operated: "gerido por",
    ...(locale === "pt-BR" ? { manage: "Gerenciar lembretes", settings: "configurações", operated: "operado por" } : {}),
  };
}
