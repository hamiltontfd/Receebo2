import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advisoryLockPool, db, emailConnectionsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

vi.mock("./mailProviders/config", () => ({ isMailProviderEnabled: () => true }));

import { OUTLOOK_SWEEP_FRESH_MS, runOutlookSweep } from "./outlookSync";

const PREFIX = "outlook-sweep-test-";
const HOUR = 60 * 60 * 1000;
const saved = { id: process.env.MICROSOFT_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET };

async function connection(lastSyncedAt: Date | null, status = "active") {
  const userId = `${PREFIX}${randomUUID()}`;
  await db.insert(emailConnectionsTable).values({
    userId, provider: "outlook", accountEmail: `${userId}@example.com`, status, lastSyncedAt,
    accessToken: "x", refreshToken: "x",
  } as typeof emailConnectionsTable.$inferInsert);
  return userId;
}

beforeEach(() => {
  process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "test-client";
  process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "test-secret";
});
afterEach(async () => {
  await db.delete(emailConnectionsTable).where(like(emailConnectionsTable.userId, `${PREFIX}%`));
  process.env.MICROSOFT_CLIENT_ID = saved.id;
  process.env.MICROSOFT_CLIENT_SECRET = saved.secret;
  if (saved.id === undefined) delete process.env.MICROSOFT_CLIENT_ID;
  if (saved.secret === undefined) delete process.env.MICROSOFT_CLIENT_SECRET;
});

/** Only this test's rows: other dev connections are ignored by the fake syncUser. */
function fakeSync(markSynced = true) {
  const calls: string[] = [];
  const fn = vi.fn(async (userId: string) => {
    if (!userId.startsWith(PREFIX)) return { checked: 0, queued: 0 };
    calls.push(userId);
    if (markSynced) {
      await db.update(emailConnectionsTable).set({ lastSyncedAt: new Date() }).where(eq(emailConnectionsTable.userId, userId));
    }
    return { checked: 3, queued: 1 };
  });
  return { fn, calls };
}

describe("Outlook sweep (cron, every 4 h)", () => {
  it("syncs only connections not synced in the last 3 h, oldest first, and is idempotent", async () => {
    expect(OUTLOOK_SWEEP_FRESH_MS).toBe(3 * HOUR);
    const never = await connection(null);
    const old = await connection(new Date(Date.now() - 30 * HOUR));
    // Synced by the previous 4-hourly run, a few minutes after its slot.
    const lastRound = await connection(new Date(Date.now() - 4 * HOUR + 10 * 60 * 1000));
    const fresh = await connection(new Date(Date.now() - 2 * HOUR));
    const reconnect = await connection(null, "needs_reconnect");
    const { fn, calls } = fakeSync();

    const first = await runOutlookSweep({ syncUser: fn });
    expect(first.status).toBe("ok");
    expect(calls).toEqual([never, old, lastRound]);
    expect(calls).not.toContain(fresh);
    expect(calls).not.toContain(reconnect);

    calls.length = 0;
    const second = await runOutlookSweep({ syncUser: fn });
    expect(second.status).toBe("ok");
    expect(calls).toEqual([]);
  });

  it("stops starting new users when the time budget is used and reports the rest as remaining", async () => {
    await connection(null);
    await connection(null);
    let clock = 0;
    const { fn, calls } = fakeSync();
    const timed = vi.fn(async (userId: string) => { const r = await fn(userId); if (userId.startsWith(PREFIX)) clock += 100_000; return r; });
    const result = await runOutlookSweep({ syncUser: timed, now: () => clock, timeBudgetMs: 50_000 });
    expect(calls).toHaveLength(1);
    expect(result.remaining).toBeGreaterThanOrEqual(1);
    // The next call continues with the user that was not reached.
    const next = await runOutlookSweep({ syncUser: fn });
    expect(next.status).toBe("ok");
    expect(calls).toHaveLength(2);
  });

  it("keeps going when one user fails, and refuses to run twice at the same time", async () => {
    const bad = await connection(null);
    await connection(null);
    const { fn, calls } = fakeSync();
    const flaky = vi.fn(async (userId: string) => { if (userId === bad) throw new Error("graph 500"); return fn(userId); });
    const result = await runOutlookSweep({ syncUser: flaky });
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(calls).toHaveLength(1);

    const holder = await advisoryLockPool.connect();
    try {
      await holder.query("SELECT pg_advisory_lock(hashtext($1))", ["receebo:outlook-daily-sweep"]);
      expect((await runOutlookSweep({ syncUser: fn })).status).toBe("busy");
    } finally {
      await holder.query("SELECT pg_advisory_unlock(hashtext($1))", ["receebo:outlook-daily-sweep"]);
      holder.release();
    }
  });
});
