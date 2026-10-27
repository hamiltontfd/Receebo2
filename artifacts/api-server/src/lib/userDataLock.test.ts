import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { accountDeletionRequestsTable, db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAccountDeletionInProgress } from "./accountDeletionState";
import {
  lockUserDataMutation,
  tryLockUserDataMutation,
  tryWithUserDataLock,
  UserDataLockBusyError,
  withUserDataLock,
} from "./userDataLock";

const createdUserIds: string[] = [];

afterEach(async () => {
  for (const userId of createdUserIds.splice(0)) {
    await db
      .delete(accountDeletionRequestsTable)
      .where(eq(accountDeletionRequestsTable.userId, userId));
  }
});

describe("user data operation lock", () => {
  it("does not exhaust the application pool under concurrent locked work", async () => {
    const operations = Array.from({ length: 12 }, (_, index) =>
      withUserDataLock(`pool-test-${index}-${randomUUID()}`, async () => {
        await db.execute(sql`SELECT pg_sleep(0.01)`);
        return index;
      }),
    );

    const result = await Promise.race([
      Promise.all(operations),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Concurrent locks timed out")), 2_000),
      ),
    ]);

    expect(result).toHaveLength(12);
  });

  it("keeps the lock until handler completion after a client disconnect", async () => {
    const userId = `disconnect-test-${randomUUID()}`;
    let releaseHandler!: () => void;
    const handlerCanFinish = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let handlerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      handlerStarted = resolve;
    });
    const response = new EventEmitter() as Response;
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    const wrapped = lockUserDataMutation(async () => {
      handlerStarted();
      await handlerCanFinish;
    });

    const first = wrapped(
      { userId } as Request,
      response,
      vi.fn() as NextFunction,
    );
    await started;
    response.emit("close");

    let secondEntered = false;
    const second = withUserDataLock(userId, async () => {
      secondEntered = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(secondEntered).toBe(false);

    releaseHandler();
    await first;
    await second;
    expect(secondEntered).toBe(true);
  });

  it("makes an in-flight sync wait for the durable deletion marker", async () => {
    const userId = `lock-test-${randomUUID()}`;
    createdUserIds.push(userId);
    let releaseDeletion!: () => void;
    const deletionCanFinish = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    let markerCreated!: () => void;
    const markerReady = new Promise<void>((resolve) => {
      markerCreated = resolve;
    });

    const deletion = withUserDataLock(userId, async () => {
      await db
        .insert(accountDeletionRequestsTable)
        .values({ userId, stage: "requested" });
      markerCreated();
      await deletionCanFinish;
    });

    await markerReady;
    let syncEntered = false;
    const sync = withUserDataLock(userId, async () => {
      syncEntered = true;
      return isAccountDeletionInProgress(userId);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(syncEntered).toBe(false);

    releaseDeletion();
    await deletion;
    await expect(sync).resolves.toBe(true);
  });
});
describe("try user data lock (email import actions)", () => {
  function fakeResponse() {
    const response = new EventEmitter() as Response;
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    return response;
  }

  it("runs the operation when the lock is free and releases it afterwards", async () => {
    const userId = `try-free-${randomUUID()}`;
    await expect(tryWithUserDataLock(userId, async () => "done")).resolves.toBe("done");
    // Released: a blocking lock gets in at once.
    await expect(
      Promise.race([
        withUserDataLock(userId, async () => "next"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("lock not released")), 1_000)),
      ]),
    ).resolves.toBe("next");
  });

  it("releases the lock when the operation throws", async () => {
    const userId = `try-throw-${randomUUID()}`;
    await expect(tryWithUserDataLock(userId, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(tryWithUserDataLock(userId, async () => "ok", { timeoutMs: 0 })).resolves.toBe("ok");
  });

  it("gives up with UserDataLockBusyError while another holder keeps the lock", async () => {
    const userId = `try-busy-${randomUUID()}`;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let acquired!: () => void;
    const holding = new Promise<void>((resolve) => { acquired = resolve; });
    const sync = withUserDataLock(userId, async () => { acquired(); await held; });
    await holding;

    const started = Date.now();
    const op = vi.fn(async () => "never");
    await expect(tryWithUserDataLock(userId, op, { timeoutMs: 300, retryMs: 50 }))
      .rejects.toBeInstanceOf(UserDataLockBusyError);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(op).not.toHaveBeenCalled();

    release();
    await sync;
    await expect(tryWithUserDataLock(userId, async () => "after", { timeoutMs: 0 })).resolves.toBe("after");
  });

  it("answers 409 SYNC_IN_PROGRESS from the route wrapper without running the handler", async () => {
    const userId = `try-route-${randomUUID()}`;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let acquired!: () => void;
    const holding = new Promise<void>((resolve) => { acquired = resolve; });
    const sync = withUserDataLock(userId, async () => { acquired(); await held; });
    await holding;

    const handler = vi.fn(async () => undefined);
    const response = fakeResponse();
    await tryLockUserDataMutation(handler, { timeoutMs: 100, retryMs: 25 })(
      { userId } as Request, response, vi.fn() as NextFunction,
    );
    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "SYNC_IN_PROGRESS" }));

    release();
    await sync;
    const free = fakeResponse();
    await tryLockUserDataMutation(handler)({ userId } as Request, free, vi.fn() as NextFunction);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(free.status).not.toHaveBeenCalledWith(409);
  });
});
