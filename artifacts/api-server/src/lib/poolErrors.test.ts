import { randomUUID } from "crypto";
import { StripeSync } from "stripe-replit-sync";
import { advisoryLockPool, guardPoolErrors, pool } from "@workspace/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { guardStripeSyncPool } from "../stripeClient";
import { connectLockClient, tryWithUserDataLock, unlockAndRelease, withUserDataLock } from "./userDataLock";

/** What the production crash looked like: the server dropping an idle connection. */
function connectionDropped(): Error {
  return Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
}

type Pool = typeof pool;
type PoolClient = Awaited<ReturnType<Pool["connect"]>>;
/** A second pool from the same pg build (the API package has no direct pg dependency). */
const PoolCtor = pool.constructor as new (config: { connectionString: string }) => Pool;

const extraPools: Pool[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const p of extraPools.splice(0)) await p.end();
});

describe("pg pool error guards (crash of 2026-10-27 15:09)", () => {
  it("the app and advisory-lock pools survive an idle client error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const p of [pool, advisoryLockPool]) {
      expect(p.listenerCount("error")).toBeGreaterThan(0);
      // Without a listener EventEmitter.emit("error") throws, which is what killed the process.
      expect(() => p.emit("error", connectionDropped(), {} as PoolClient)).not.toThrow();
    }
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("app pool"),
      expect.objectContaining({ pool: "app", code: "57P01" }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("advisory-lock pool"),
      expect.objectContaining({ pool: "advisory-lock" }),
    );
  });

  it("logs only the code and message, never the connection string", () => {
    const secretUrl = "postgres://user:hunter2@127.0.0.1:1/none";
    const p = new PoolCtor({ connectionString: secretUrl });
    extraPools.push(p);
    const log = vi.fn();
    guardPoolErrors(p, "test", log);
    p.emit("error", connectionDropped(), {} as PoolClient);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls[0])).not.toContain("hunter2");
  });

  it("the Stripe sync pool gets the same guard", async () => {
    const sync = new StripeSync({
      poolConfig: { connectionString: "postgres://user:pw@127.0.0.1:1/none" },
      stripeSecretKey: "sk_test_placeholder",
      stripeWebhookSecret: "",
    });
    const syncPool = sync.postgresClient.pool;
    extraPools.push(syncPool as unknown as Pool);
    expect(syncPool.listenerCount("error")).toBe(0);
    guardStripeSyncPool(sync);
    expect(syncPool.listenerCount("error")).toBe(1);
    expect(() => syncPool.emit("error", connectionDropped(), {} as PoolClient)).not.toThrow();
  });
});

describe("borrowed advisory-lock clients", () => {
  it("an error on a borrowed lock client does not crash and the client is discarded", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lease = await connectLockClient();
    const release = vi.spyOn(lease.client, "release");
    // pg-pool drops its own listener while a client is checked out.
    expect(() => lease.client.emit("error", connectionDropped())).not.toThrow();
    expect(lease.error?.message).toContain("terminating connection");
    await unlockAndRelease(lease, `pool-guard-${randomUUID()}`, true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("borrowed client error"), expect.anything());
  });

  it("a healthy lock client goes back to the pool without discard", async () => {
    const lease = await connectLockClient();
    const release = vi.spyOn(lease.client, "release");
    const key = `pool-guard-${randomUUID()}`;
    await lease.client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
    await unlockAndRelease(lease, key, true);
    expect(release).toHaveBeenCalledWith();
  });

  it("withUserDataLock survives its connection dying mid-operation and the lock frees up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const userId = `pool-guard-${randomUUID()}`;
    let borrowed: PoolClient | undefined;
    const onAcquire = (client: PoolClient) => { borrowed = client; };
    advisoryLockPool.once("acquire", onAcquire);
    const before = advisoryLockPool.totalCount;
    const result = await withUserDataLock(userId, async () => {
      expect(borrowed).toBeDefined();
      expect(() => borrowed!.emit("error", connectionDropped())).not.toThrow();
      return "finished";
    });
    expect(result).toBe("finished");
    // The errored connection was destroyed, which also releases its session lock.
    await expect(tryWithUserDataLock(userId, async () => "again", { timeoutMs: 3_000, retryMs: 50 }))
      .resolves.toBe("again");
    expect(advisoryLockPool.totalCount).toBeLessThanOrEqual(Math.max(before, 1));
  });
});
