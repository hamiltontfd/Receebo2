import type { AppLocale } from "@/lib/locale";

/** Server code when an email import action can't get the user's data lock (a mailbox sync is running). */
export const SYNC_IN_PROGRESS_CODE = "SYNC_IN_PROGRESS";

/** Neutral toast shown when approving or dismissing an email import while a sync is running. */
export const SYNC_IN_PROGRESS_COPY: Record<AppLocale, string> = {
  en: "Still syncing your email — try again in a minute",
  "pt-PT": "Ainda a sincronizar o seu email — tente novamente daqui a um minuto",
  "pt-BR": "Ainda sincronizando seu email — tente de novo em um minuto",
};
