import { pool } from "@workspace/db";
import { logger } from "./logger";

const SSL_MODES = new Set(["disable", "allow", "prefer", "require", "verify-ca", "verify-full", "no-verify"]);

/**
 * What the DATABASE_URL asks for, without exposing it: only the sslmode
 * parameter (one of the libpq values, else "other") and whether the host is
 * loopback / a socket. Never the host name, user or password.
 */
export function describeDatabaseUrl(url: string | undefined): { sslmode: string; loopback: boolean } {
  if (!url) return { sslmode: "absent", loopback: false };
  try {
    const u = new URL(url);
    const mode = u.searchParams.get("sslmode");
    const host = (u.hostname || u.searchParams.get("host") || "").toLowerCase();
    const loopback = host === "" || host === "localhost" || host.startsWith("127.") || host === "[::1]" || host.startsWith("/");
    return { sslmode: mode === null ? "absent" : SSL_MODES.has(mode) ? mode : "other", loopback };
  } catch {
    return { sslmode: "unparsed", loopback: false };
  }
}

/**
 * Logs whether the app's own connection to PostgreSQL is TLS-encrypted (the
 * socket node-postgres opened, not the server's view behind a pooler).
 * Read-only; never changes how the pool connects.
 */
export async function logDatabaseTls(): Promise<boolean | null> {
  const url = describeDatabaseUrl(process.env.DATABASE_URL);
  try {
    const client = await pool.connect();
    try {
      const stream = (client as unknown as { connection?: { stream?: { encrypted?: boolean } } }).connection?.stream;
      const tls = stream?.encrypted === true;
      const level = tls || url.loopback ? "info" : "warn";
      logger[level]({ tls, sslmode: url.sslmode, loopback: url.loopback },
        tls ? "Database connection uses TLS" : "Database connection is NOT TLS-encrypted (add sslmode=require to DATABASE_URL if the provider supports it)");
      return tls;
    } finally {
      client.release();
    }
  } catch (err) {
    const e = err as { code?: unknown };
    logger.warn({ code: e?.code, sslmode: url.sslmode }, "Database TLS check failed");
    return null;
  }
}
