import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const state = vi.hoisted(() => ({ accepted: true, country: null as string | null }));
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-user"] ?? null }),
}));
vi.mock("./legalAcceptance", () => ({ hasCurrentLegalAcceptance: async () => state.accepted }));
vi.mock("./accountDeletionState", () => ({ isAccountDeletionInProgress: async () => false }));
vi.mock("./marketGeoip", async (original) => ({
  ...await original<object>(),
  requestCountry: () => ({ country: state.country, market: state.country === "PT" ? "PT" : null }),
}));
import market from "../routes/market";
import { requireAuth } from "../middlewares/requireAuth";
import { countryForRequest, getAccountCountry } from "./accountCountry";

const users = Array.from({ length: 5 }, () => `country-fixture-${randomUUID()}`);
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), market);
  app.get("/private", requireAuth, (req, res) => res.json({ savedCountry: req.savedCountry }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  for (const user of users) await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, user));
});
const call = (path: string, user: string, body?: object) => fetch(`${base}${path}`, {
  method: body ? "PATCH" : "GET",
  headers: { "Content-Type": "application/json", "x-test-user": user },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

describe("saved country, consent and first-write semantics", () => {
  it("writes nothing before legal consent, including exempt authenticated endpoints", async () => {
    state.accepted = false;
    state.country = "PT";
    expect((await call("/private", users[0])).status).toBe(428);
    expect((await call("/account/language", users[0])).status).toBe(200);
    expect(await getAccountCountry(users[0])).toBeNull();
    const rows = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, users[0]));
    expect(rows).toHaveLength(0);
    state.accepted = true;
  });
  it("saves actual uncovered country, never replaces it on travel, and keeps request GeoIP separate", async () => {
    state.country = "JP";
    expect(await (await call("/private", users[0])).json()).toEqual({ savedCountry: "JP" });
    state.country = "PT";
    const response = await (await call("/account/market", users[0])).json();
    expect(response).toMatchObject({ country: "PT", savedCountry: "JP", market: "PT" });
    expect(await getAccountCountry(users[0])).toBe("JP");
  });
  it("unknown GeoIP creates no row; concurrent first writes preserve one winning country", async () => {
    state.country = null;
    expect((await call("/private", users[1])).status).toBe(200);
    expect(await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, users[1]))).toHaveLength(0);
    const results = await Promise.all([countryForRequest(users[2], "PT"), countryForRequest(users[2], "BR")]);
    expect(results[0]).toBe(results[1]);
    expect(["PT", "BR"]).toContain(await getAccountCountry(users[2]));
  });
  it("manual PATCH accepts ISO case-insensitively and UK as GB; first-write does not replace correction", async () => {
    for (const country of ["br", "uk", "JP"]) {
      const response = await call("/account/country", users[0], { country });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ savedCountry: country === "uk" ? "GB" : country.toUpperCase() });
    }
    expect(await countryForRequest(users[0], "US")).toBe("JP");
    for (const country of ["EU", "ZZ", "", "Portugal", null]) {
      expect((await call("/account/country", users[0], { country })).status).toBe(400);
    }
  });
  it("column rejects invalid shapes while permitting null", async () => {
    await expect(db.insert(userPreferencesTable).values({ userId: users[3], country: "pt" })).rejects.toThrow();
    await db.insert(userPreferencesTable).values({ userId: users[3], country: null });
    expect(await getAccountCountry(users[3])).toBeNull();
  });
});
