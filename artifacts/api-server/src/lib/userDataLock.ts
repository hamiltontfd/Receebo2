import { advisoryLockPool, connectGuarded, type GuardedClient } from "@workspace/db";
import type { RequestHandler } from "express";
import { isAccountDeletionInProgress } from "./accountDeletionState";

/** Borrow a lock connection that cannot crash the process if it dies while held. */
export function connectLockClient(): Promise<GuardedClient> {
  return connectGuarded(advisoryLockPool, "advisory-lock");
}

/**
 * Unlock (when held) and hand the connection back. If the connection errored
 * while borrowed or the unlock fails, the connection is destroyed instead:
 * closing it drops the session lock, and a broken client never returns to the pool.
 */
export async function unlockAndRelease(lease: GuardedClient, key: string, locked: boolean): Promise<void> {
  if (lease.error) {
    lease.release();
    return;
  }
  try {
    if (locked) await lease.client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]);
  } catch (err) {
    lease.release(err);
    throw err;
  }
  lease.release();
}

export async function withUserDataLock<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lease = await connectLockClient();
  let locked = false;
  try {
    await lease.client.query("SELECT pg_advisory_lock(hashtext($1))", [userId]);
    locked = true;
    return await operation();
  } finally {
    await unlockAndRelease(lease, userId, locked);
  }
}

export function lockUserDataMutation(handler: RequestHandler): RequestHandler {
  return async (req, res, next): Promise<void> => {
    await withUserDataLock(req.userId!, async () => {
      if (await isAccountDeletionInProgress(req.userId!)) {
        res.status(423).json({
          error: "Account deletion is in progress",
          code: "ACCOUNT_DELETION_IN_PROGRESS",
        });
        return;
      }
      await handler(req, res, next);
    });
  };
}
/** The user's data lock stayed taken (usually by a mailbox sync) past the try window. */
export class UserDataLockBusyError extends Error {
  constructor() {
    super("User data is busy");
    this.name = "UserDataLockBusyError";
  }
}

export const SYNC_IN_PROGRESS_CODE = "SYNC_IN_PROGRESS";

export interface TryUserDataLockOptions {
  /** Total time to keep retrying before giving up (default 5 s). */
  timeoutMs?: number;
  /** Pause between attempts (default 250 ms). */
  retryMs?: number;
}

/**
 * Like withUserDataLock, but never queues behind a long holder (a mailbox sync
 * holds the lock for minutes): retries pg_try_advisory_lock for up to
 * timeoutMs, then throws UserDataLockBusyError. Lock and unlock run on the
 * same pooled connection, and the unlock always runs once acquired.
 */
export async function tryWithUserDataLock<T>(
  userId: string,
  operation: () => Promise<T>,
  { timeoutMs = 5_000, retryMs = 250 }: TryUserDataLockOptions = {},
): Promise<T> {
  const lease = await connectLockClient();
  const { client } = lease;
  let locked = false;
  try {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [userId],
      );
      if (result.rows[0]?.locked) {
        locked = true;
        break;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new UserDataLockBusyError();
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryMs, left)));
    }
    return await operation();
  } finally {
    await unlockAndRelease(lease, userId, locked);
  }
}

/** lockUserDataMutation that answers 409 SYNC_IN_PROGRESS instead of waiting for the lock. */
export function tryLockUserDataMutation(
  handler: RequestHandler,
  options?: TryUserDataLockOptions,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      await tryWithUserDataLock(req.userId!, async () => {
        if (await isAccountDeletionInProgress(req.userId!)) {
          res.status(423).json({
            error: "Account deletion is in progress",
            code: "ACCOUNT_DELETION_IN_PROGRESS",
          });
          return;
        }
        await handler(req, res, next);
      }, options);
    } catch (err) {
      if (!(err instanceof UserDataLockBusyError)) throw err;
      res.status(409).json({
        error: "Your email is still syncing. Try again in a minute.",
        code: SYNC_IN_PROGRESS_CODE,
      });
    }
  };
}
