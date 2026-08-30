import { advisoryLockPool } from "@workspace/db";
import type { RequestHandler } from "express";
import { isAccountDeletionInProgress } from "./accountDeletionState";

export async function withUserDataLock<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const client = await advisoryLockPool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [userId]);
    return await operation();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [userId]);
    } finally {
      client.release();
    }
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