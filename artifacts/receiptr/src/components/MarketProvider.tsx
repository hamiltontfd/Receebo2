import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { customFetch, type AccountMarket, type MarketSuggestion } from "@workspace/api-client-react";
import { lt } from "@/lib/landingLocale";
import { lookupExternalMarket } from "@/lib/marketSuggestion";

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
type MarketState = {
  market: Market | null;
  source: "account" | "visitor" | "suggestion" | "unknown";
  confirmed: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  choose: (market: Market) => Promise<void>;
  retry: () => void;
};
const Context = createContext<MarketState | null>(null);
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
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", storage);
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
          let prefs = await request<AccountMarket>("account/market", { signal: abort.signal });
          if (!current()) return;
          if (!prefs.market && pendingVisitor.current) {
            prefs = await request<AccountMarket>("account/market", {
              method: "PATCH", signal: abort.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ market: pendingVisitor.current, onlyIfUnset: true }),
            });
          }
          if (!current()) return;
          chosen = prefs.market;
          setAccount(chosen);
          pendingVisitor.current = null;
          try { sessionStorage.removeItem(pendingKey(userId)); } catch { /* no storage */ }
        } else {
          chosen = readVisitorMarket();
          if (current()) setVisitor(chosen);
        }
        if (!chosen) {
          let result: MarketSuggestion = { country: null, market: null };
          try {
            result = await request<MarketSuggestion>("market/suggestion", { signal: abort.signal });
          } catch {
            // A browser-side lookup can still work if the local API is unavailable.
            // Account-read failures above must never take this fallback path.
          }
          if (!current() || abort.signal.aborted) return;
          if (!result.country) result = await lookupExternalMarket(abort.signal);
          if (current()) setSuggestion(isMarket(result.market) ? result.market : null);
        }
      } catch {
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
    } catch {
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
    market, source: confirmed ? (userId ? "account" : "visitor") : suggestion ? "suggestion" : "unknown",
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
