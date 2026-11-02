import { LEGAL_ACCEPTED_EVENT } from "@/components/LegalConsentGate";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { customFetch, type AccountMarket, type MarketSuggestion } from "@workspace/api-client-react";
import { lt } from "@/lib/landingLocale";

export type Market = "PT" | "BR" | "US";
export const VISITOR_MARKET_KEY = "receebo:visitorMarket";
export function isMarket(value: unknown): value is Market {
  return value === "PT" || value === "BR" || value === "US";
}
export function readVisitorMarket(): Market | null {
  try {
    const value = localStorage.getItem(VISITOR_MARKET_KEY);
    return isMarket(value) ? value : null;
  } catch { return null; }
}
function pendingKey(userId: string) { return `receebo:pendingVisitorMarket:${userId}`; }
function readPendingVisitor(userId: string | null): Market | null {
  try {
    const value = userId ? sessionStorage.getItem(pendingKey(userId)) : null;
    return isMarket(value) ? value : null;
  } catch { return null; }
}
export type MarketState = {
  market: Market | null;
  /** ISO country the server detected from this request's IP (never stored); null when unknown. */
  country: string | null;
  source: "account" | "visitor" | "suggestion" | "unknown";
  confirmed: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  choose: (market: Market) => Promise<void>;
  retry: () => void;
};
/** Exported for lib/region.ts (rules) and tests; components use useMarket(). */
export const MarketContext = createContext<MarketState | null>(null);
const Context = MarketContext;
/** The API refuses account market reads/writes before legal consent (Hamilton, 2 Nov 2026). */
const consentPending = (err: unknown) => (err as { status?: number } | null)?.status === 428;
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const request = <T,>(path: string, options?: RequestInit) =>
  customFetch<T>(`${base}/api/${path}`, { credentials: "include", ...options });

/** A keyed scope is discarded on logout/account switch, including all in-flight responses. */
export function MarketProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  return <MarketScope key={!isLoaded ? "hydrating" : userId ?? "visitor"} userId={userId ?? null} ready={isLoaded}>
    {children}
  </MarketScope>;
}

function MarketScope({ userId, ready, children }: { userId: string | null; ready: boolean; children: ReactNode }) {
  const [visitor, setVisitor] = useState(readVisitorMarket);
  const pendingVisitor = useRef(readPendingVisitor(userId) ?? visitor);
  const [account, setAccount] = useState<Market | null>(null);
  const [suggestion, setSuggestion] = useState<Market | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const active = useRef(false);
  const revision = useRef(0);
  const failedChoice = useRef<Market | null>(null);
  const mutationBusy = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      if (!mutationBusy.current && !failedChoice.current) setReload((value) => value + 1);
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const storage = (event: StorageEvent) => {
      if (!userId && event.key === VISITOR_MARKET_KEY) refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", storage);
    window.addEventListener(LEGAL_ACCEPTED_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", storage);
      window.removeEventListener(LEGAL_ACCEPTED_EVENT, refresh);
    };
  }, [ready, userId]);

  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    let cancelled = false;
    const atRevision = revision.current;
    const current = () => !cancelled && active.current && atRevision === revision.current;
    setLoading(true);
    setError(null);
    // Never store an account choice in browser-wide storage. Consume visitor
    // intent once, before any async work, so another account cannot inherit it.
    if (userId) {
      try {
        if (pendingVisitor.current) sessionStorage.setItem(pendingKey(userId), pendingVisitor.current);
      } catch { /* in-memory retry remains available */ }
      try { localStorage.removeItem(VISITOR_MARKET_KEY); } catch { /* no storage */ }
      setVisitor(null);
    }
    async function hydrate() {
      try {
        let chosen: Market | null = null;
        if (userId) {
          // A visitor's own landing choice is applied first (only if the account
          // has none); otherwise the server fills an empty market from this
          // request's IP, once. A saved market is never replaced.
          let prefs: AccountMarket & { country?: string | null };
          if (pendingVisitor.current) {
            prefs = await request<AccountMarket>("account/market", {
              method: "PATCH", signal: abort.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ market: pendingVisitor.current, onlyIfUnset: true }),
            });
          } else {
            prefs = await request<AccountMarket>("account/market", { signal: abort.signal });
          }
          if (!current()) return;
          chosen = prefs.market;
          setAccount(chosen);
          setCountry(prefs.country ?? null);
          pendingVisitor.current = null;
          try { sessionStorage.removeItem(pendingKey(userId)); } catch { /* no storage */ }
        } else {
          chosen = readVisitorMarket();
          if (current()) setVisitor(chosen);
          // Server-side GeoIP only. No third-party lookup: the visitor's IP never
          // leaves our server. Unknown stays unknown (manual choice remains).
          if (!chosen) {
            let result: MarketSuggestion = { country: null, market: null };
            try {
              result = await request<MarketSuggestion>("market/suggestion", { signal: abort.signal });
            } catch { /* unknown */ }
            if (!current() || abort.signal.aborted) return;
            setCountry(result.country ?? null);
            setSuggestion(isMarket(result.market) ? result.market : null);
          }
        }
      } catch (err) {
        // Before legal consent nothing is read or stored; a pending landing
        // choice stays in this tab's session and is applied after consent.
        if (userId && consentPending(err)) return;
        if (current()) setError(userId
          ? lt("Could not load or save your account market. Try again.", "Não foi possível carregar ou guardar o mercado da conta. Tente novamente.", "Não foi possível carregar ou salvar o mercado da conta. Tente novamente.")
          : lt("Location unavailable. You can choose a market and keep browsing.", "Localização indisponível. Pode escolher uma região e continuar a navegar.", "Localização indisponível. Você pode escolher uma região e continuar navegando."));
      } finally {
        clearTimeout(timeout);
        if (current()) setLoading(false);
      }
    }
    void hydrate();
    return () => { cancelled = true; clearTimeout(timeout); abort.abort(); };
  }, [userId, ready, reload]);

  const choose = async (market: Market) => {
    if (!ready || !isMarket(market) || mutationBusy.current) return;
    mutationBusy.current = true;
    const nextRevision = ++revision.current;
    const current = () => active.current && revision.current === nextRevision;
    setSaving(true);
    setLoading(false);
    setError(null);
    failedChoice.current = market;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    try {
      if (userId) {
        const result = await request<AccountMarket>("account/market", {
          method: "PATCH",
          signal: abort.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ market }),
        });
        if (!current()) return;
        setAccount(result.market);
        pendingVisitor.current = null;
        try { sessionStorage.removeItem(pendingKey(userId)); } catch { /* no storage */ }
      } else {
        localStorage.setItem(VISITOR_MARKET_KEY, market);
        if (current()) setVisitor(market);
      }
      if (current()) failedChoice.current = null;
    } catch (err) {
      if (userId && consentPending(err)) {
        // Not stored before consent: keep it for this tab and apply it right after.
        pendingVisitor.current = market;
        try { sessionStorage.setItem(pendingKey(userId), market); } catch { /* in-memory */ }
        if (current()) failedChoice.current = null;
        return;
      }
      if (current()) setError(lt("Could not save your market. Check your connection or browser storage and try again.", "Não foi possível guardar a região. Verifique a ligação ou o armazenamento do navegador e tente novamente.", "Não foi possível salvar a região. Verifique a conexão ou o armazenamento do navegador e tente novamente."));
    } finally {
      clearTimeout(timeout);
      mutationBusy.current = false;
      if (current()) setSaving(false);
    }
  };
  const confirmed = ready ? (userId ? account : visitor) : null;
  const market = ready ? confirmed ?? suggestion : null;
  return <Context.Provider value={{
    market, country, source: confirmed ? (userId ? "account" : "visitor") : suggestion ? "suggestion" : "unknown",
    confirmed: !!confirmed, loading, saving, error, choose,
    retry: () => {
      if (failedChoice.current) void choose(failedChoice.current);
      else setReload((value) => value + 1);
    },
  }}>{children}</Context.Provider>;
}

export function useMarket(): MarketState {
  const context = useContext(Context);
  if (!context) throw new Error("MarketProvider is required");
  return context;
}
