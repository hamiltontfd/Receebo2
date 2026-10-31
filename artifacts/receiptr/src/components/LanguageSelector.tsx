import { useId } from "react";
import { useLanguage } from "./LanguageProvider";
import { useAppLocale, type AppLocale } from "@/lib/locale";
import { lt } from "@/lib/landingLocale";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { language, loading, saving, error, choose, retry } = useLanguage();
  useAppLocale();
  const id = useId();
  return <div className={compact ? "max-w-48 text-xs" : "space-y-2"} data-testid="language-selector">
    <label htmlFor={id} className={compact ? "sr-only" : "block text-sm font-medium"}>
      {lt("Language", "Idioma")}
    </label>
    <select id={id} value={language ?? "auto"} disabled={loading || saving}
      title={lt("Translation is partial; other app screens remain in English.", "A tradução é parcial; outras páginas continuam em inglês.")}
      aria-describedby={compact ? undefined : `${id}-help`}
      className="max-w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
      onChange={(event) => void choose(event.target.value === "auto" ? null : event.target.value as AppLocale)}>
      <option value="auto">{lt("Browser language", "Idioma do navegador")}</option>
      <option value="en" lang="en">English</option>
      <option value="pt-PT" lang="pt-PT">Português (Portugal)</option>
      <option value="pt-BR" lang="pt-BR">Português (Brasil)</option>
    </select>
    {!compact && <p id={`${id}-help`} className="text-xs text-muted-foreground">
      {lt(
        "Language is independent of market, purchase country and currency. Translation is partial; other app screens remain in English.",
        "O idioma é independente da região, do país da compra e da moeda. A tradução é parcial; as restantes páginas da aplicação continuam em inglês.",
        "O idioma é independente da região, do país da compra e da moeda. A tradução é parcial; as outras telas do aplicativo continuam em inglês.",
      )}
    </p>}
    {saving && <p role="status">{lt("Saving…", "A guardar…", "Salvando…")}</p>}
    {error && <div role="alert" className="text-xs text-destructive">
      {lt("Could not load or save language.", "Não foi possível carregar ou guardar o idioma.", "Não foi possível carregar ou salvar o idioma.")}
      {" "}<button type="button" className="underline" onClick={retry}>{lt("Try again", "Tentar novamente")}</button>
    </div>}
  </div>;
}
