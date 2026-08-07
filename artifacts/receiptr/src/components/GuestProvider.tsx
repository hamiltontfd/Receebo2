import { createContext, useContext, useState, useCallback, useEffect } from "react";

const GUEST_TOKEN_KEY = "receebo:guestToken";

export interface GuestUser {
  id: string;
  name: string;
  email: string;
}

export interface GuestContextValue {
  isGuest: boolean;
  guestUser: GuestUser | null;
  enterGuestMode: () => Promise<void>;
  exitGuestMode: () => void;
}

const GuestContext = createContext<GuestContextValue | null>(null);

async function issueGuestToken(): Promise<string> {
  const existing = localStorage.getItem(GUEST_TOKEN_KEY);
  if (existing) {
    // Re-confirm the token still exists on the server (idempotent endpoint)
    const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
    const res = await fetch(`${base}/api/guest-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: existing }),
    });
    if (res.ok) return existing;
    // Token no longer valid — clear it and issue a fresh one
    localStorage.removeItem(GUEST_TOKEN_KEY);
  }

  const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
  const res = await fetch(`${base}/api/guest-session`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create guest session");
  const { guestToken } = (await res.json()) as { guestToken: string };
  localStorage.setItem(GUEST_TOKEN_KEY, guestToken);
  return guestToken;
}

export function clearGuestToken(): void {
  localStorage.removeItem(GUEST_TOKEN_KEY);
}

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const isGuest = guestUser !== null;

  // Guest mode entry disabled — app uses 7-day trial instead.
  // Auto-restore from localStorage is intentionally suppressed.
  // useEffect(() => {
  //   const stored = localStorage.getItem(GUEST_TOKEN_KEY);
  //   if (stored) {
  //     setGuestUser({ id: stored, name: "Guest", email: "guest@receebo.local" });
  //   }
  // }, []);

  const enterGuestMode = useCallback(async () => {
    const token = await issueGuestToken();
    setGuestUser({ id: token, name: "Guest", email: "guest@receebo.local" });
  }, []);

  const exitGuestMode = useCallback(() => {
    setGuestUser(null);
  }, []);

  return (
    <GuestContext.Provider value={{ isGuest, guestUser, enterGuestMode, exitGuestMode }}>
      {children}
    </GuestContext.Provider>
  );
}

export function useGuestMode() {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error("useGuestMode must be used within GuestProvider");
  return ctx;
}
