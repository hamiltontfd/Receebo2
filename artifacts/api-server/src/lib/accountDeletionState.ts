import { accountDeletionRequestsTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function isAccountDeletionInProgress(
  userId: string,
): Promise<boolean> {
  const [request] = await db
    .select({ stage: accountDeletionRequestsTable.stage })
    .from(accountDeletionRequestsTable)
    .where(eq(accountDeletionRequestsTable.userId, userId))
    .limit(1);
  return Boolean(
    request &&
      ["requested", "database_deleted", "completed"].includes(request.stage),
  );
}