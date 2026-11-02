/**
 * Lifecycle emails follow the email language rule on the real PostgreSQL:
 * manual language > browser language detected after consent > English, and
 * the language is captured before the account is deleted.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, emailSendsTable, userPreferencesTable } from "@workspace/db";

const fx = vi.hoisted(() => ({ deliver: vi.fn(async () => ({ ok: true, id: "re_test" })) }));
vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser: async () => ({
    firstName: "Ana", primaryEmailAddressId: "p", emailAddresses: [{ id: "p", emailAddress: "ana@example.invalid" }],
  }) } },
}));
vi.mock("./emailService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emailService")>()),
  deliverEmail: fx.deliver,
}));
import { captureDeletionConfirmation, sendDeletionWarningEmail } from "./lifecycleEmails";

const user = `lifecycle-lang-${randomUUID()}`;
afterAll(async () => {
  await db.delete(emailSendsTable).where(eq(emailSendsTable.userId, user));
  await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, user));
});

describe("lifecycle email language (real PostgreSQL)", () => {
  it("detected browser language without a manual choice; manual wins; captured before deletion", async () => {
    expect((await captureDeletionConfirmation(user))?.locale).toBe("en");
    await db.insert(userPreferencesTable).values({ userId: user, detectedLanguage: "pt-BR", detectedLanguageAt: new Date() });
    expect((await captureDeletionConfirmation(user))?.locale).toBe("pt-BR");
    await sendDeletionWarningEmail(user, { stage: "7d", deletionDate: new Date(Date.now() + 7 * 86_400_000) });
    expect(fx.deliver.mock.calls.at(-1)![0].subject).toBe("Faltam 7 dias para manter seus recibos no Receebo");
    await db.update(userPreferencesTable).set({ language: "pt-PT" }).where(eq(userPreferencesTable.userId, user));
    const snapshot = await captureDeletionConfirmation(user);
    expect(snapshot).toMatchObject({ locale: "pt-PT", formatLocale: "pt-PT", email: "ana@example.invalid" });
  });
});
