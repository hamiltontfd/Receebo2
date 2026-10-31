import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { customFetch, type AccountLanguage } from "@workspace/api-client-react";
import {
  isAppLocale, notifyLocaleChange, setAccountLocale, useAppLocale, type AppLocale,
} from "@/lib/locale";

type LanguageState = {
  language: AppLocale | null;
  loading: boolean;
  saving: boolean;
  error: boolean;
  choose: (value: AppLocale | null) => Promise<void>;
  retry: () => void;
};
const Context = createContext<LanguageState | null>(null);
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const request = (options?: RequestInit) =>
  customFetch<AccountLanguage>(`${base}/api/account/language`, { credentials: "include", ...options });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  return <LanguageScope key={!isLoaded ? "loading" : userId ?? "visitor"} userId={userId ?? null} ready={isLoaded}>
    {children}
  </LanguageScope>;
}

function LanguageScope({ children, userId, ready }: { children: ReactNode; userId: string | null; ready: boolean }) {
  const [language, setLanguage] = useState<AppLocale | null>(null);
  const [loading, setLoading] = useState(!!userId || !ready);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const alive = useRef(false);
  const busy = useRef(false);
  const failed = useRef<{ value: AppLocale | null } | null>(null);
  const revision = useRef(0);

  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; setAccountLocale(undefined); };
  }, []);
  useLayoutEffect(() => {
    setAccountLocale(!ready ? null : userId ? language : undefined);
  }, [userId, ready, language]);

  useEffect(() => {
    const refresh = () => {
      if (!busy.current && !failed.current) setReload((value) => value + 1);
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("languagechange", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("languagechange", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      setLanguage(null);
      notifyLocaleChange();
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const atRevision = revision.current;
    let cancelled = false;
    const current = () => !cancelled && alive.current && revision.current === atRevision;
    setLoading(true);
    setError(false);
    void request({ signal: controller.signal })
      .then((result) => { if (current()) setLanguage(result.language); })
      .catch(() => { if (current()) setError(true); })
      .finally(() => { clearTimeout(timeout); if (current()) setLoading(false); });
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [userId, ready, reload]);

  async function choose(value: AppLocale | null) {
    if (!ready || !userId || busy.current || (value !== null && !isAppLocale(value))) return;
    busy.current = true;
    const atRevision = ++revision.current;
    const current = () => alive.current && revision.current === atRevision;
    setSaving(true);
    setLoading(false);
    setError(false);
    failed.current = { value };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await request({
        method: "PATCH", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: value }),
      });
      if (current()) {
        setLanguage(result.language);
        failed.current = null;
        notifyLocaleChange();
      }
    } catch {
      if (current()) setError(true);
    } finally {
      clearTimeout(timeout);
      busy.current = false;
      if (current()) setSaving(false);
    }
  }
  return <Context.Provider value={{
    language, loading, saving, error, choose,
    retry: () => { if (failed.current) void choose(failed.current.value); else setReload((value) => value + 1); },
  }}><LanguageDocument />{children}</Context.Provider>;
}

function LanguageDocument() {
  const locale = useAppLocale();
  useLayoutEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return null;
}

export function useLanguage() {
  const context = useContext(Context);
  if (!context) throw new Error("LanguageProvider is required");
  return context;
}
