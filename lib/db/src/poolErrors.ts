import type { Pool, PoolClient } from "pg";

export type PoolErrorLog = (message: string, details: { pool: string; code?: string; message: string }) => void;

const defaultLog: PoolErrorLog = (message, details) => console.error(message, details);

/** Only the error code and message: never the client, config or connection string. */
function describe(pool: string, err: unknown): { pool: string; code?: string; message: string } {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  return {
    pool,
    ...(typeof e?.code === "string" ? { code: e.code } : {}),
    message: typeof e?.message === "string" ? e.message : String(err),
  };
}

/**
 * pg emits "error" on the Pool when an idle client's connection dies (Neon
 * restart, network blip). With no listener Node turns that into an uncaught
 * exception and the process exits. pg-pool has already dropped the broken
 * client, so logging is all that is needed.
 */
export function guardPoolErrors<T extends Pool>(pool: T, name: string, log: PoolErrorLog = defaultLog): T {
  pool.on("error", (err) => {
    log(`[db] idle client error on ${name} pool; connection discarded`, describe(name, err));
  });
  return pool;
}

export interface GuardedClient {
  client: PoolClient;
  /** The first error the connection emitted while borrowed, if any. */
  readonly error: Error | undefined;
  /**
   * Returns the client to the pool, or destroys it when it errored while
   * borrowed or `err` is given (closing the connection also drops any
   * session-level advisory lock it still holds). Safe to call once.
   */
  release(err?: unknown): void;
}

/**
 * pool.connect() for long-held clients (advisory locks). pg-pool removes its
 * own error listener while a client is checked out, so a connection that dies
 * during a long operation would crash the process. This keeps a listener on
 * the client until release.
 */
export async function connectGuarded(pool: Pool, name: string, log: PoolErrorLog = defaultLog): Promise<GuardedClient> {
  const client = await pool.connect();
  let error: Error | undefined;
  let released = false;
  const onError = (err: Error) => {
    if (!error) error = err;
    log(`[db] borrowed client error on ${name} pool; connection will be discarded`, describe(name, err));
  };
  client.on("error", onError);
  return {
    client,
    get error() {
      return error;
    },
    release(err?: unknown) {
      if (released) return;
      released = true;
      client.removeListener("error", onError);
      const discard = err ?? error;
      if (discard) client.release(discard instanceof Error ? discard : new Error(String(discard)));
      else client.release();
    },
  };
}
