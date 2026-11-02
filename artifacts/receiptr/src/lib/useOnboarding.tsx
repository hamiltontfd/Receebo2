import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { usePwaUpdateBlocker } from "@/lib/pwa";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, type AccountOnboarding, type OnboardingProgressInput } from "@workspace/api-client-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const empty: AccountOnboarding = { receiptDone: false, searchDone: false, completed: false, dismissed: false };
const journalKey = (id: string) => `receebo:onboarding:pending:${id}`;

// Only new account-scoped writes are recoverable. Never attribute the old global
// searchDone/dismissed keys to whichever account happens to sign in next.
function readPending(id: string): OnboardingProgressInput {
  try {
    const data = JSON.parse(localStorage.getItem(journalKey(id)) ?? "{}");
    return { ...(data.searchDone === true ? { searchDone: true } : {}),
      ...(data.dismissed === true ? { dismissed: true } : {}) };
  } catch { return {}; }
}
function storePending(id: string, data: OnboardingProgressInput) {
  try {
    if (Object.keys(data).length) localStorage.setItem(journalKey(id), JSON.stringify(data));
    else localStorage.removeItem(journalKey(id));
  } catch { /* In-memory retry still works when browser storage is unavailable. */ }
}
function merge(a: AccountOnboarding, b: AccountOnboarding): AccountOnboarding {
  const receiptDone = a.receiptDone || b.receiptDone;
  const searchDone = a.searchDone || b.searchDone;
  return { receiptDone, searchDone, completed: a.completed || b.completed || (receiptDone && searchDone),
    dismissed: a.dismissed || b.dismissed };
}

export interface OnboardingState {
  step1Done: boolean;
  step2Done: boolean;
  allDone: boolean;
  dismissed: boolean;
  ready: boolean;
  visible: boolean;
  celebrating: boolean;
  markSearchDone: () => void;
  dismiss: () => void;
}
const Context = createContext<OnboardingState | null>(null);
const inactive: OnboardingState = {
  step1Done: false, step2Done: false, allDone: false, dismissed: false,
  ready: false, visible: false, celebrating: false, markSearchDone() {}, dismiss() {},
};

/** Lives above routes: navigation cannot cancel persistence or its retry loop.
 * Keyed by Clerk account so no optimistic progress/celebration leaks between accounts.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  const account = isLoaded && isSignedIn ? userId : null;
  return <OnboardingScope key={account ?? "inactive"} userId={account ?? null}>{children}</OnboardingScope>;
}

function OnboardingScope({ children, userId }: { children: ReactNode; userId: string | null }) {
  const client = useQueryClient();
  const [location] = useLocation();
  const previousLocation = useRef(location);
  const key = ["account-onboarding", userId];
  const [pending, setPending] = useState(() => userId ? readPending(userId) : {});
  const pendingRef = useRef(pending);
  usePwaUpdateBlocker(!!userId && Object.keys(pending).length > 0);
  const [celebrating, setCelebrating] = useState(false);
  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      const data = await customFetch<AccountOnboarding>(`${base}/api/account/onboarding`, {
        signal, credentials: "include", headers: { "X-Onboarding-Account": userId! },
      });
      // A slow read must not undo an acknowledged write in the same client.
      return merge(client.getQueryData<AccountOnboarding>(key) ?? empty, data);
    },
    staleTime: 0, gcTime: 0, retry: 2, refetchInterval: 30_000,
    refetchOnMount: "always",
  });
  const data = query.data ?? empty;
  const state = merge(data, { ...empty, searchDone: pending.searchDone === true, dismissed: pending.dismissed === true });
  const ready = !!userId && query.isSuccess;

  useEffect(() => {
    if (previousLocation.current !== location && userId) void query.refetch();
    previousLocation.current = location;
  }, [location, userId, query.refetch]);

  const enqueue = useCallback((patch: OnboardingProgressInput) => {
    if (!userId) return;
    const next = { ...pendingRef.current, ...patch };
    pendingRef.current = next;
    storePending(userId, next); // Write journal before network or navigation.
    setPending(next);
  }, [userId]);

  useEffect(() => {
    if (!userId || !Object.keys(pending).length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const flush = async () => {
      try {
        const saved = await customFetch<AccountOnboarding>(`${base}/api/account/onboarding`, {
          method: "PATCH", credentials: "include", signal: controller.signal,
          headers: { "Content-Type": "application/json", "X-Onboarding-Account": userId },
          body: JSON.stringify(pending),
        });
        if (stopped) return;
        client.setQueryData<AccountOnboarding>(["account-onboarding", userId], old => merge(old ?? empty, saved));
        const next = { ...pendingRef.current };
        if (saved.searchDone) delete next.searchDone;
        if (saved.dismissed) delete next.dismissed;
        pendingRef.current = next;
        storePending(userId, next);
        setPending(next);
      } catch {
        if (!stopped) timer = setTimeout(flush, 5_000);
      }
    };
    void flush();
    const online = () => { if (timer) clearTimeout(timer); void flush(); };
    window.addEventListener("online", online);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, [userId, pending, client]);

  useEffect(() => {
    if (!celebrating) return;
    const timer = setTimeout(() => setCelebrating(false), 2_000);
    return () => clearTimeout(timer);
  }, [celebrating]);

  const markSearchDone = useCallback(() => {
    if (!ready || !state.receiptDone || state.searchDone || state.completed || state.dismissed) return;
    enqueue({ searchDone: true });
    setCelebrating(true); // Only a local action celebrates, never hydration.
  }, [ready, state.receiptDone, state.searchDone, state.completed, state.dismissed, enqueue]);
  const dismiss = useCallback(() => enqueue({ dismissed: true }), [enqueue]);
  const value: OnboardingState = userId ? {
    step1Done: state.receiptDone, step2Done: state.searchDone, allDone: state.completed,
    dismissed: state.dismissed, ready, celebrating,
    visible: ready && !state.dismissed && (!state.completed || celebrating),
    markSearchDone, dismiss,
  } : inactive;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOnboarding(): OnboardingState {
  const value = useContext(Context);
  if (!value) throw new Error("useOnboarding requires OnboardingProvider");
  return value;
}
