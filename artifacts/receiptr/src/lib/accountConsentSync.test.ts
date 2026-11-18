import { afterEach, describe, expect, it, vi } from "vitest";
import { accountConsentNotApplicable, beginAccountConsentSync, waitForAccountConsent } from "./accountConsentSync";

afterEach(() => vi.useRealTimers());

describe("trial consent synchronization barrier", () => {
  it("waits for the account PATCH, ignores another account, and resolves on completion", async () => {
    const finish = beginAccountConsentSync("barrier-account");
    let ready = false;
    const waiting = waitForAccountConsent("barrier-account").then(() => { ready = true; });
    accountConsentNotApplicable("other-barrier-account");
    await Promise.resolve();
    expect(ready).toBe(false);
    finish();
    await waiting;
    expect(ready).toBe(true);
  });
  it("waits for a producer that mounts later; an older PATCH cannot release a newer choice", async () => {
    let ready = false;
    const waiting = waitForAccountConsent("late-producer").then(() => { ready = true; });
    const old = beginAccountConsentSync("late-producer");
    const latest = beginAccountConsentSync("late-producer");
    old();
    await Promise.resolve();
    expect(ready).toBe(false);
    latest();
    await waiting;
    expect(ready).toBe(true);
  });
  it("does not block unknown-country defaults or hang access when synchronization is unavailable", async () => {
    accountConsentNotApplicable("unknown-country");
    await waitForAccountConsent("unknown-country");
    vi.useFakeTimers();
    let ready = false;
    const waiting = waitForAccountConsent("offline-account").then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(4999);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(ready).toBe(true);
  });
});
