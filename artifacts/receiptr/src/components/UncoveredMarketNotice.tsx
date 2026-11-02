/**
 * Uncovered country notice (Hamilton, 2 Nov 2026): "Quando o mercado não for
 * ainda coberto pelo app, devemos alertar o usuário e ter um fallback para
 * deixar eles clicarem num botão e dizerem que têm interesse. (podemos medir isso)".
 *
 * Shown when the server-detected country (MarketProvider.country, never stored)
 * is not PT, BR or US. The app stays usable with the Portugal/EU rules.
 * "I'm interested" adds one to an aggregate per-country count on the server.
 * The browser only remembers, per country, that it already sent (so the count
 * isn't inflated) or that the notice was closed in this session.
 */
import { useContext, useState } from "react";
import { Globe2, X } from "lucide-react";
import { MarketContext } from "@/components/MarketProvider";
import { Button } from "@/components/ui/button";
import { countryName } from "@/lib/countries";
import { useAppLocale, type AppLocale } from "@/lib/locale";

export const COVERED_COUNTRIES = new Set(["PT", "BR", "US"]);
export const interestSentKey = (country: string) => `receebo:marketInterestSent:${country}`;
export const noticeDismissedKey = (country: string) => `receebo:uncoveredNoticeClosed:${country}`;

export function uncoveredCopy(locale: AppLocale, country: string) {
  if (locale === "pt-BR") return {
    title: `O Receebo ainda não atende ${country}`,
    body: "Você pode usar o app, mas os prazos de devolução e garantia seguem as regras de Portugal e da União Europeia, que podem não valer no seu país.",
    button: "Tenho interesse",
    hint: `Toque para avisar que você quer o Receebo em ${country}. Só contamos os toques por país, sem guardar nada sobre você.`,
    thanks: "Obrigado! Isso nos ajuda a decidir para onde ir em seguida.",
    error: "Não foi possível enviar. Tente novamente.",
    close: "Fechar",
  };
  if (locale === "pt-PT") return {
    title: `O Receebo ainda não cobre ${country}`,
    body: "Pode usar a aplicação, mas os prazos de devolução e garantia seguem as regras de Portugal e da União Europeia, que podem não se aplicar no seu país.",
    button: "Tenho interesse",
    hint: `Toque para nos dizer que quer o Receebo em ${country}. Só contamos os toques por país, sem guardar nada sobre si.`,
    thanks: "Obrigado! Isto ajuda-nos a decidir onde chegar a seguir.",
    error: "Não foi possível enviar. Tente novamente.",
    close: "Fechar",
  };
  return {
    title: `Receebo doesn't cover ${country} yet`,
    body: "You can use the app, but return and warranty dates follow the rules for Portugal and the European Union, which may not apply where you live.",
    button: "I'm interested",
    hint: `Tap to tell us you want Receebo in ${country}. We only count taps per country, with nothing about you.`,
    thanks: "Thanks! This helps us decide where to go next.",
    error: "Couldn't send. Try again.",
    close: "Close",
  };
}

const read = (storage: () => Storage, key: string) => { try { return storage().getItem(key); } catch { return null; } };
const write = (storage: () => Storage, key: string) => { try { storage().setItem(key, "1"); } catch { /* no storage */ } };

export function UncoveredMarketNotice({ variant = "inline" }: { variant?: "inline" | "floating" }) {
  const locale = useAppLocale();
  const country = useContext(MarketContext)?.country ?? null;
  const code = country?.toUpperCase() ?? null;
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [closed, setClosed] = useState(false);
  if (!code || COVERED_COUNTRIES.has(code) || closed) return null;
  if (state !== "sent" && (read(() => localStorage, interestSentKey(code)) || read(() => sessionStorage, noticeDismissedKey(code)))) return null;

  const copy = uncoveredCopy(locale, countryName(code, locale));
  const send = async () => {
    setState("sending");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/market/interest`, {
        method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: code }),
      });
      if (!res.ok && res.status !== 429) throw new Error(String(res.status));
      write(() => localStorage, interestSentKey(code));
      setState("sent");
    } catch {
      setState("error");
    }
  };
  const close = () => { write(() => sessionStorage, noticeDismissedKey(code)); setClosed(true); };

  const wrap = variant === "floating"
    ? "fixed z-40 left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[380px] shadow-lg"
    : "mx-4 mt-3 md:mx-auto md:w-full md:max-w-2xl";
  return (
    <section role="status" aria-live="polite" data-testid="notice-uncovered-market"
      className={`${wrap} rounded-2xl border bg-card text-card-foreground p-4`}>
      <div className="flex items-start gap-3">
        <Globe2 className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold leading-snug">{copy.title}</p>
          {state === "sent" ? (
            <p className="text-sm text-muted-foreground" data-testid="text-market-interest-thanks">{copy.thanks}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{copy.body}</p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button size="sm" className="rounded-full" onClick={() => void send()} disabled={state === "sending"} data-testid="button-market-interest">
                  {copy.button}
                </Button>
                {state === "error" && <span className="text-xs text-destructive">{copy.error}</span>}
              </div>
              <p className="text-xs text-muted-foreground">{copy.hint}</p>
            </>
          )}
        </div>
        <button type="button" onClick={close} aria-label={copy.close} className="-mr-1 -mt-1 p-1.5 rounded-full text-muted-foreground hover:bg-secondary" data-testid="button-uncovered-close">
          <X className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
