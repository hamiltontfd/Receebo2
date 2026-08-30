import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { accountDeletionRequestsTable, db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAccountDeletionInProgress } from "./accountDeletionState";
import { lockUserDataMutation, withUserDataLock } from "./userDataLock";

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