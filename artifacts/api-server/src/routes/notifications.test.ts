import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, userPreferencesTable } from "@workspace/db";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, res: any) => res.sendStatus(401),
}));
vi.stubEnv("SESSION_SECRET", "notifications-test-secret");
import notifications from "./notifications";
import { generateUnsubscribeToken } from "../lib/emailService";

let server: Server;
let base: string;
const userId = `unsubscribe-fixture-${randomUUID()}`;

beforeAll(async () => {
  const app = express();
  app.use(express.json(), express.urlencoded({ extended: true }));
  app.use(notifications);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(done => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
});

async function optOut() {
  const [row] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
  return row?.notificationsOptOut ?? false;
}
const url = () => `${base}/notifications/unsubscribe?token=${encodeURIComponent(generateUnsubscribeToken(userId))}`;

describe("unsubscribe links (real PostgreSQL)", () => {
  it("GET only shows a confirmation button and changes nothing (safe for link scanners)", async () => {
    const res = await fetch(url());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post"');
    expect(html).toContain("warranty and return reminder");
    expect(await optOut()).toBe(false);
  });
  it("POST from the confirmation button unsubscribes", async () => {
    const res = await fetch(url(), { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("been unsubscribed");
    expect(await optOut()).toBe(true);
  });
  it("accepts RFC 8058 one-click POSTs", async () => {
    await db.update(userPreferencesTable).set({ notificationsOptOut: false }).where(eq(userPreferencesTable.userId, userId));
    const res = await fetch(url(), {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);
    expect(await optOut()).toBe(true);
  });
  it("rejects invalid tokens on GET and POST", async () => {
    expect((await fetch(`${base}/notifications/unsubscribe?token=bogus.x`)).status).toBe(400);
    expect((await fetch(`${base}/notifications/unsubscribe?token=bogus.x`, { method: "POST" })).status).toBe(400);
    expect((await fetch(`${base}/notifications/unsubscribe`)).status).toBe(400);
  });
});
