import { db, accountTrialsTable, trialUploadsTable } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";

/**
 * No-card account trial: 15 days of access and up to 5 successful receipts
 * (manual uploads + approved email imports share the cap). Reaching the cap
 * blocks adding receipts but keeps viewing/search/export/alerts until day 15.
 */
export const TRIAL_LIMIT = 5;
export const TRIAL_DURATION_DAYS = 15;
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

/** Exact copy shown wherever a 6th receipt is refused (kept in sync with web trialCopy.ts). */
export const TRIAL_CAP_MESSAGE = `You've used your ${TRIAL_LIMIT} free receipts. Subscribe to add more.`;
export const TRIAL_CAP_ERROR = {
  error: "subscription_required",
  code: "trial_exhausted",
  message: TRIAL_CAP_MESSAGE,
} as const;

/**
 * Idempotent startup migration: trials created under the old 7-day rule are
 * extended to the current duration measured from their original start. Rows
 * already at (or beyond) the current duration are untouched.
 */
export async function extendTrialsToCurrentDuration(): Promise<number> {
  const interval = `${TRIAL_DURATION_DAYS} days`;
  const result = await db.execute(sql`
    UPDATE account_trials
       SET ends_at = started_at + ${interval}::interval
     WHERE ends_at < started_at + ${interval}::interval`);
  return (result as { rowCount?: number | null }).rowCount ?? 0;
}

export function trialState(endsAt: Date, used: number, now = new Date()) {
  if (now >= endsAt) return "trial_expired" as const;
  return used >= TRIAL_LIMIT ? "trial_exhausted" as const : "account_trial" as const;
}

export async function accountTrialStatus(userId: string) {
  const [trial] = await db.select().from(accountTrialsTable)
    .where(eq(accountTrialsTable.userId, userId));
  if (!trial) return null;
  const entries = await db.select().from(trialUploadsTable)
    .where(eq(trialUploadsTable.userId, userId));
  const used = entries.filter(e => e.state === "succeeded").length;
  const pending = entries.filter(e => e.state === "processing" ||
    (e.state === "reserved" && e.expiresAt > new Date())).length;
  return {
    trial, used, pending, state: trialState(trial.endsAt, used),
    remaining: Math.max(0, TRIAL_LIMIT - used - pending),
    reviewReceiptId: entries.filter(e => e.state === "succeeded" && e.receiptId)
      .sort((a, b) => b.receiptId! - a.receiptId!)[0]?.receiptId ?? null,
  };
}

// Call within the existing cross-process user advisory lock.
export async function reserveTrialUpload(userId: string, objectPath: string, expiresAt: Date) {
  const status = await accountTrialStatus(userId);
  if (!status) return;
  if (status.state !== "account_trial" || status.remaining < 1)
    throw new Error("TRIAL_UPLOAD_LIMIT");
  await db.insert(trialUploadsTable).values({ userId, objectPath, expiresAt });
}

export async function finishTrialUpload(objectPath: string, success: boolean, receiptId: number, connection: Pick<typeof db, "update"> = db) {
  // A released entry can never be revived by a stale worker/watchdog retry.
  await connection.update(trialUploadsTable)
    .set({ state: success ? "succeeded" : "released", receiptId })
    .where(and(eq(trialUploadsTable.objectPath, objectPath),
      eq(trialUploadsTable.state, "processing")));
}

export async function consumeTrialReservation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string, objectPath: string, receiptId: number,
) {
  const [trial] = await tx.select().from(accountTrialsTable)
    .where(eq(accountTrialsTable.userId, userId));
  if (!trial) return;
  const [entry] = await tx.update(trialUploadsTable).set({ state: "processing", receiptId })
    .where(and(eq(trialUploadsTable.objectPath, objectPath),
      eq(trialUploadsTable.userId, userId), eq(trialUploadsTable.state, "reserved"),
      gt(trialUploadsTable.expiresAt, new Date())))
    .returning();
  if (!entry) throw new Error("Invalid or expired trial reservation");
}
