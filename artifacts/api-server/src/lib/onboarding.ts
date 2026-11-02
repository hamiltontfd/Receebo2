import { db, receiptsTable, userPreferencesTable as prefs } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export async function migrateAccountOnboarding(): Promise<void> {
  await db.execute(sql`ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS onboarding_receipt_done boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS onboarding_search_done boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS onboarding_dismissed boolean NOT NULL DEFAULT false`);
}

export const onboardingSelection = {
  receiptDone: prefs.onboardingReceiptDone,
  searchDone: prefs.onboardingSearchDone,
  completed: prefs.onboardingCompleted,
  dismissed: prefs.onboardingDismissed,
};

/** Called inside receipt save/delete transactions, before the evidence can disappear. */
export async function rememberOnboardingReceipt(userId: string, executor: Pick<typeof db, "insert"> = db) {
  await executor.insert(prefs).values({ userId, onboardingReceiptDone: true })
    .onConflictDoUpdate({
      target: prefs.userId,
      set: {
        onboardingReceiptDone: true,
        onboardingCompleted: sql`${prefs.onboardingCompleted} OR ${prefs.onboardingSearchDone}`,
        updatedAt: new Date(),
      },
    });
}

/** Caller holds the user data lock, shared with deletion and other preference writes.
 * Existing saved receipts prove only step one, never search, completion or dismissal.
 * A single upsert makes even stale/duplicate client updates monotonic.
 */
export async function advanceOnboarding(
  userId: string, input: { searchDone?: boolean; dismissed?: boolean } = {},
) {
  const [receipt] = await db.select({ id: receiptsTable.id }).from(receiptsTable)
    .where(and(eq(receiptsTable.userId, userId), eq(receiptsTable.isDraft, false)))
    .limit(1);
  const receiptDone = !!receipt;
  const searchDone = input.searchDone === true;
  const dismissed = input.dismissed === true;
  const [state] = await db.insert(prefs).values({
    userId, onboardingReceiptDone: receiptDone, onboardingSearchDone: searchDone,
    onboardingCompleted: receiptDone && searchDone, onboardingDismissed: dismissed,
  }).onConflictDoUpdate({
    target: prefs.userId,
    set: {
      onboardingReceiptDone: sql`${prefs.onboardingReceiptDone} OR ${receiptDone}`,
      onboardingSearchDone: sql`${prefs.onboardingSearchDone} OR ${searchDone}`,
      onboardingCompleted: sql`${prefs.onboardingCompleted} OR
        ((${prefs.onboardingReceiptDone} OR ${receiptDone}) AND
         (${prefs.onboardingSearchDone} OR ${searchDone}))`,
      onboardingDismissed: sql`${prefs.onboardingDismissed} OR ${dismissed}`,
      updatedAt: new Date(),
    },
  }).returning(onboardingSelection);
  return state;
}
