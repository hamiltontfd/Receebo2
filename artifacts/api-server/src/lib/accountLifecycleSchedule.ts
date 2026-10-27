/**
 * Pure schedule rules for frozen accounts (no email/deletion imports, so the
 * billing and account routes can use them cheaply). Sweep: ./accountLifecycle.ts.
 */
import { db, accountLifecycleTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { SubscriptionStatus } from "./subscriptionStatus";

import type { DeletionWarningStage } from "./emailService";

export const DAY_MS = 86_400_000;
export const RETENTION_DAYS = 60;
export const FIRST_WARNING_DAYS = 30;
export const FINAL_WARNING_DAYS = 7;

export function dataDeletionEnabled(env: { DATA_DELETION_ENABLED?: string } = process.env): boolean {
  return env.DATA_DELETION_ENABLED?.trim().toLowerCase() === "true";
}

/** Idempotent startup migration (also run by integration tests). */
export async function migrateAccountLifecycle(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS account_lifecycle (
      user_id text PRIMARY KEY,
      access_ended_at timestamptz NOT NULL,
      deletion_due_at timestamptz NOT NULL,
      warning_30_sent_at timestamptz,
      warning_7_sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

/** Frozen = had access (trial or paid) and lost it. Owners and active plans never are. */
export function isFrozen(status: Pick<SubscriptionStatus, "accessState" | "canUseApp">): boolean {
  return !status.canUseApp &&
    (status.accessState === "trial_expired" || status.accessState === "subscription_required");
}

export function accessEndedAt(status: Pick<SubscriptionStatus, "accessState" | "trialEndAt" | "currentPeriodEnd">, now: Date): Date {
  const candidate = status.accessState === "trial_expired" ? status.trialEndAt : status.currentPeriodEnd;
  return candidate && candidate.getTime() <= now.getTime() ? candidate : now;
}

/**
 * 60 days after access ended, but never less than 30 days after the account
 * was first seen frozen (accounts frozen before this feature shipped get the
 * full notice period and both warnings).
 */
export function deletionDueAt(ended: Date, firstSeen: Date): Date {
  return new Date(Math.max(
    ended.getTime() + RETENTION_DAYS * DAY_MS,
    firstSeen.getTime() + FIRST_WARNING_DAYS * DAY_MS,
  ));
}

export type LifecycleAction =
  | { kind: "none" }
  | { kind: "warn"; stage: DeletionWarningStage }
  | { kind: "delete" }
  /** Due but the final warning never went out (e.g. the flag was off): move the date 7 days out and warn. */
  | { kind: "reschedule_and_warn" }
  | { kind: "postpone_delete"; reason: string };

/** Pure decision for one frozen account (tested directly). */
export function nextLifecycleAction(row: {
  deletionDueAt: Date; warning30SentAt: Date | null; warning7SentAt: Date | null;
}, now: Date): LifecycleAction {
  const due = row.deletionDueAt.getTime();
  const t = now.getTime();
  if (t >= due) {
    // Never delete without the final warning having gone out at least 6 days earlier.
    if (!row.warning7SentAt) return { kind: "reschedule_and_warn" };
    if (t - row.warning7SentAt.getTime() < 6 * DAY_MS) return { kind: "postpone_delete", reason: "final_warning_too_recent" };
    return { kind: "delete" };
  }
  if (t >= due - FINAL_WARNING_DAYS * DAY_MS) {
    return row.warning7SentAt ? { kind: "none" } : { kind: "warn", stage: "7d" };
  }
  if (t >= due - FIRST_WARNING_DAYS * DAY_MS) {
    return row.warning30SentAt ? { kind: "none" } : { kind: "warn", stage: "30d" };
  }
  return { kind: "none" };
}

/** Deletion date shown in the app/emails for a frozen account, or null. */
export async function scheduledDeletionDate(userId: string): Promise<Date | null> {
  try {
    const [row] = await db.select({ deletionDueAt: accountLifecycleTable.deletionDueAt })
      .from(accountLifecycleTable).where(eq(accountLifecycleTable.userId, userId));
    return row?.deletionDueAt ?? null;
  } catch {
    return null; // table not migrated yet: callers fall back to the computed date
  }
}
