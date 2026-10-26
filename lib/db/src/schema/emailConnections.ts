import {
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Per-user mailbox connections for providers other than Gmail (Gmail keeps
 * its original `gmail_connections` table so existing tokens stay untouched).
 *
 * Tokens are encrypted at rest with AES-256-GCM (api-server tokenCrypto.ts).
 * Microsoft rotates refresh tokens on every use, so each refresh persists the
 * new value.
 */
export const emailConnectionsTable = pgTable(
  "email_connections",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** outlook (future: other providers) */
    provider: text("provider").notNull(),
    accountEmail: text("account_email"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
    /** active | needs_reconnect */
    status: text("status").notNull().default("active"),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** Reserved for incremental (delta) sync. */
    deltaLink: text("delta_link"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("email_connections_user_provider_unique").on(t.userId, t.provider)],
);

export type EmailConnection = typeof emailConnectionsTable.$inferSelect;
