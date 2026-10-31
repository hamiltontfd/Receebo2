import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionKey, actionLimit, cleanupActionRateLimits, consumeAction } from "./actionRateLimit";

const keys: string[] = [];
function identity(action: Parameters<typeof actionKey>[0]) {
  const id = `rate-test-${randomUUID()}`;
  keys.push(actionKey(action, id));
  return id;
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await pool.query("DELETE FROM action_rate_limits WHERE key = ANY($1::text[])", [keys.splice(0)]);
});

describe("shared database action budgets", () => {
  it("admits exactly the limit under concurrent requests from independent module instances", async () => {
    const id = identity("upload");
    vi.stubEnv("ACTION_UPLOAD_PER_MINUTE", "7");
    const otherInstance = await import("./actionRateLimit?other-instance");
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) =>
      (i % 2 ? otherInstance.consumeAction : consumeAction)("upload", id)));
    expect(results.filter(r => r.allowed)).toHaveLength(7);
    expect(results.every(r => r.retryAfter > 0 && r.retryAfter <= 60)).toBe(true);
    const stored = await pool.query("SELECT hits FROM action_rate_limits WHERE key=$1", [actionKey("upload", id)]);
    expect(stored.rows[0].hits).toBe(8);
  });
  it("isolates accounts and actions and stores no raw identity", async () => {
    const a = identity("mail-sync");
    const b = identity("mail-sync");
    keys.push(actionKey("upload", a));
    expect((await consumeAction("mail-sync", a)).allowed).toBe(true);
    expect((await consumeAction("mail-sync", a)).allowed).toBe(false);
    expect((await consumeAction("mail-sync", b)).allowed).toBe(true);
    expect((await consumeAction("upload", a)).allowed).toBe(true);
    expect(actionKey("upload", a)).toMatch(/^[a-f0-9]{64}$/);
    expect(actionKey("upload", a)).not.toContain(a);
  });
  it("does not extend blocked windows and resets expired counters using database time", async () => {
    const id = identity("mail-sync");
    await consumeAction("mail-sync", id);
    const key = actionKey("mail-sync", id);
    const before = await pool.query("SELECT expires_at FROM action_rate_limits WHERE key=$1", [key]);
    expect((await consumeAction("mail-sync", id)).allowed).toBe(false);
    const after = await pool.query("SELECT expires_at FROM action_rate_limits WHERE key=$1", [key]);
    expect(after.rows[0].expires_at).toEqual(before.rows[0].expires_at);
    await pool.query("UPDATE action_rate_limits SET expires_at = now() - interval '1 second' WHERE key=$1", [key]);
    expect((await consumeAction("mail-sync", id)).allowed).toBe(true);
  });
  it("cleans expired counters without removing live counters", async () => {
    const expired = identity("upload");
    const live = identity("upload");
    await consumeAction("upload", expired);
    await consumeAction("upload", live);
    await pool.query("UPDATE action_rate_limits SET expires_at = now() - interval '1 second' WHERE key=$1",
      [actionKey("upload", expired)]);
    await Promise.all([cleanupActionRateLimits(), cleanupActionRateLimits()]);
    const rows = await pool.query("SELECT key FROM action_rate_limits WHERE key = ANY($1::text[])",
      [[actionKey("upload", expired), actionKey("upload", live)]]);
    expect(rows.rows).toEqual([{ key: actionKey("upload", live) }]);
  });
  it("keeps conservative defaults and rejects invalid configuration", () => {
    expect(actionLimit("upload")).toBe(30);
    expect(actionLimit("receipt-read")).toBe(120);
    expect(actionLimit("mail-sync")).toBe(1);
    vi.stubEnv("ACTION_UPLOAD_PER_MINUTE", "0");
    expect(() => actionLimit("upload")).toThrow("Invalid ACTION_UPLOAD_PER_MINUTE");
  });
});
