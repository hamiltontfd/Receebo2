/**
 * Push notifications in the account's language, end to end on the real
 * dev/test PostgreSQL: the daily sweeps read user_preferences (manual language
 * wins, then detected browser language, else English). Email and push
 * delivery are mocked; claims and language lookup are real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db, receiptsTable, userPreferencesTable } from "@workspace/db";

/** Intl uses no-break spaces in pt money ("1299,99\u00a0€"); compare with plain spaces. */
const nb = (s: string | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ");
const fx = vi.hoisted(() => ({ users: new Set<string>(), push: vi.fn() }));
vi.mock("./subscriptionStatus", () => ({
  getSubscriptionStatus: async (userId: string) => ({ canUseApp: fx.users.has(userId), accessState: "paid" }),
}));
vi.mock("./emailService", () => ({
  sendWarrantyReminderEmail: async () => true,
  sendReturnWindowEmail: async () => true,
  sendTrialEndingEmail: async () => true,
}));
vi.mock("./pushNotifications", () => ({ sendPushNotification: fx.push }));
import { runReturnWindowSweep, runWarrantyReminderSweep } from "./orphanCleanup";

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const users = {
  ptPT: `push-ptpt-${randomUUID()}`, // manual Settings choice pt-PT
  ptBR: `push-ptbr-${randomUUID()}`, // detected browser language pt-BR
  manualEn: `push-manual-en-${randomUUID()}`, // manual en wins over detected pt-BR
  none: `push-none-${randomUUID()}`, // no preferences row: English
};
const ids: Record<string, number> = {};

beforeAll(async () => {
  for (const u of Object.values(users)) fx.users.add(u);
  fx.push.mockImplementation(async (uid: string) => fx.users.has(uid));
  await db.insert(userPreferencesTable).values([
    { userId: users.ptPT, language: "pt-PT" },
    { userId: users.ptBR, detectedLanguage: "pt-BR", detectedLanguageAt: new Date() },
    { userId: users.manualEn, language: "en", detectedLanguage: "pt-BR", detectedLanguageAt: new Date() },
  ]);
  // Online purchase delivered/bought 13 days ago in PT: 14-day withdrawal closes tomorrow.
  const online = { merchant: "Worten", currency: "EUR", total: 499.99, isOnlinePurchase: true, purchaseCountry: "PT",
    products: [{ name: "Televisor LG OLED", price: 499.99 }], purchaseDate: iso(-13) };
  // EU legal warranty (2 years) ends in 10 days.
  const old = new Date(Date.now() + 10 * DAY); old.setUTCFullYear(old.getUTCFullYear() - 2);
  const warranty = { merchant: "Fnac", currency: "EUR", total: 89.9, isOnlinePurchase: false, category: "Electronics",
    products: [{ name: "Auscultadores Sony", price: 89.9 }], purchaseDate: old.toISOString().slice(0, 10) };
  for (const [key, userId] of Object.entries(users)) {
    for (const [kind, values] of [["return", online], ["warranty", warranty]] as const) {
      const [row] = await db.insert(receiptsTable).values({
        userId, objectPath: `/objects/uploads/${randomUUID()}`, originalFileName: `${key}-${kind}.jpg`, contentType: "image/jpeg",
        status: "completed", isDraft: false, ...values,
      }).returning({ id: receiptsTable.id });
      ids[`${key}:${kind}`] = row.id;
    }
  }
});
afterAll(async () => {
  await db.delete(receiptsTable).where(inArray(receiptsTable.userId, Object.values(users)));
  await db.delete(userPreferencesTable).where(inArray(userPreferencesTable.userId, Object.values(users)));
});

const pushFor = (key: string) => fx.push.mock.calls.find(([, p]) => p.receiptId === ids[key])?.[1];

describe("push notifications follow the account language (real PostgreSQL)", () => {
  it("return-window push: pt-PT (manual), pt-BR (detected), English (manual en over detected pt; no preferences)", async () => {
    await runReturnWindowSweep();
    expect(pushFor("ptPT:return")).toMatchObject({ title: "O prazo de devolução termina amanhã", receiptId: ids["ptPT:return"] });
    expect(nb(pushFor("ptPT:return").body)).toBe("Televisor LG OLED · 499,99 € · Worten");
    expect(pushFor("ptBR:return")).toMatchObject({ title: "O prazo de devolução termina amanhã" });
    expect(nb(pushFor("ptBR:return").body)).toMatch(/^Televisor LG OLED · €\s?499,99 · Worten$/);
    expect(pushFor("manualEn:return")).toMatchObject({ title: "Return window closes tomorrow", body: "Televisor LG OLED · €499.99 · Worten" });
    expect(pushFor("none:return")).toMatchObject({ title: "Return window closes tomorrow" });
  });

  it("warranty push: Portuguese title with the long date, English unchanged", async () => {
    await runWarrantyReminderSweep();
    const due = iso(10);
    const pt = new Date(`${due}T00:00:00Z`).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    const en = new Date(`${due}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    expect(pushFor("ptPT:warranty")).toMatchObject({ title: `Garantia legal termina em ${pt}` });
    expect(nb(pushFor("ptPT:warranty").body)).toBe("Auscultadores Sony · 89,90 € · Fnac");
    expect(pushFor("ptBR:warranty")).toMatchObject({ title: `Garantia legal termina em ${pt}` });
    expect(pushFor("manualEn:warranty")).toMatchObject({ title: `Legal warranty ends ${en}` });
    expect(pushFor("none:warranty")).toMatchObject({ title: `Legal warranty ends ${en}` });
  });
});
