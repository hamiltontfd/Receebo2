import { getAppLocale } from "./locale";

/** Copy selection only: never use language to infer account market or legal country. */
export function lt(english: string, portuguese: string, brazilian = portuguese): string {
  const locale = getAppLocale();
  return locale === "pt-BR" ? brazilian : locale === "pt-PT" ? portuguese : english;
}
