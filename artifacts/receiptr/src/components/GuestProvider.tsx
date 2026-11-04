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

// Guest mode is off on the server (POST /api/guest-session answers 410), so the
// client never requests a guest session. An old token left in localStorage is
// only read by GuestIdSync to claim its receipts after sign-in.

export function clearGuestToken(): void {
  localStorage.removeItem(GUEST_TOKEN_KEY);
}

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const isGuest = guestUser !== null;

  // Guest mode entry disabled — app uses the 15-day account trial instead.
  // Auto-restore from localStorage is intentionally suppressed.
  // useEffect(() => {
  //   const stored = localStorage.getItem(GUEST_TOKEN_KEY);
  //   if (stored) {
  //     setGuestUser({ id: stored, name: "Guest", email: "guest@receebo.local" });
  //   }
  // }, []);

  // No-op: guest sessions can no longer be created.
  const enterGuestMode = useCallback(async () => {}, []);

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
