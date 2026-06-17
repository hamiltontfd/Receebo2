import { createContext, useContext, useState, useCallback } from "react";

export interface GuestUser {
  id: string;
  name: string;
  email: string;
}

export interface GuestContextValue {
  isGuest: boolean;
  guestUser: GuestUser | null;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
}

const GuestContext = createContext<GuestContextValue | null>(null);

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const isGuest = guestUser !== null;

  const enterGuestMode = useCallback(() => {
    const id = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setGuestUser({ id, name: "Guest", email: "guest@receiptr.local" });
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
