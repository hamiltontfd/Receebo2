/**
 * Page-session coordination only: no consent defaults or browser storage here.
 * Trial creation waits for the current account PATCH, not the legally gated
 * attribution POST. A failed/unavailable PATCH cannot block access indefinitely.
 */
type SyncState = { pending: boolean };
const states = new Map<string, SyncState>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

export function beginAccountConsentSync(userId: string): () => void {
  const state = { pending: true };
  states.set(userId, state);
  notify();
  return () => {
    if (states.get(userId) !== state) return;
    state.pending = false;
    notify();
  };
}

export function accountConsentNotApplicable(userId: string): void {
  states.set(userId, { pending: false });
  notify();
}

export async function waitForAccountConsent(userId: string | null | undefined, timeoutMs = 5000): Promise<void> {
  // Allow sibling passive effects to register this render's newest choice.
  await Promise.resolve();
  if (!userId || states.get(userId)?.pending === false) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      listeners.delete(check);
      resolve();
    };
    const check = () => { if (states.get(userId)?.pending === false) done(); };
    const timer = setTimeout(done, timeoutMs);
    listeners.add(check);
    check();
  });
}
