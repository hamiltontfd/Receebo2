import { randomUUID } from "crypto";
import { accountDeletionRequestsTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDeletionAwareExtraction } from "./extractionQueue";
import { withUserDataLock } from "./userDataLock";

const createdUserIds: string[] = [];

afterEach(async () => {
  for (const userId of createdUserIds.splice(0)) {
    await db
      .delete(accountDeletionRequestsTable)
      .where(eq(accountDeletionRequestsTable.userId, userId));
  }
});

describe("deletion-aware receipt extraction", () => {
  it("finishes in-flight processing before deletion and skips later processing", async () => {
    const userId = `extraction-race-${randomUUID()}`;
    createdUserIds.push(userId);
    let finishExtraction!: () => void;
    const extractionCanFinish = new Promise<void>((resolve) => {
      finishExtraction = resolve;
    });
    let extractionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      extractionStarted = resolve;
    });

    const extraction = runDeletionAwareExtraction(userId, async () => {
      extractionStarted();
      await extractionCanFinish;
    });
    await started;

    let deletionEntered = false;
    const deletion = withUserDataLock(userId, async () => {
      deletionEntered = true;
      await db
        .insert(accountDeletionRequestsTable)
        .values({ userId, stage: "requested" });
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(deletionEntered).toBe(false);

    finishExtraction();
    await expect(extraction).resolves.toBe(true);
    await deletion;

    const laterProcessing = vi.fn(async () => {});
    await expect(
      runDeletionAwareExtraction(userId, laterProcessing),
    ).resolves.toBe(false);
    expect(laterProcessing).not.toHaveBeenCalled();
  });
});