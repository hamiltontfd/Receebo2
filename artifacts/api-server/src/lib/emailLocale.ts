import { db, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type EmailLocale = "en" | "pt-PT" | "pt-BR";

/** Background sends have no browser. Automatic/missing/unsupported => English,
 * never infer language from market, purchase country, currency or the server. */
export function resolveEmailLocale(language: unknown): EmailLocale {
  return language === "pt-PT" || language === "pt-BR" ? language : "en";
}

export async function getUserEmailLocale(userId: string): Promise<EmailLocale> {
  if (userId.startsWith("guest_")) return "en";
  const [preferences] = await db.select({ language: userPreferencesTable.language })
    .from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
  // A failed read must reject, not silently send in the wrong language.
  return resolveEmailLocale(preferences?.language);
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
