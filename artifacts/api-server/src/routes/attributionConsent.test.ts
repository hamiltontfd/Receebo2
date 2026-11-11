import express, { type Request, type Response, type NextFunction } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: { execute } }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth(req: Request, res: Response, next: NextFunction) {
    if (req.headers["x-test-user"] !== "account-A") { res.status(401).end(); return; }
    req.userId = "account-A"; next();
  },
}));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../lib/metaCapi", () => ({ sendMetaEvent: vi.fn() }));
import router from "./attribution";
import { marketingConsentFor, saveFirstTouch } from "../lib/adAttributionStore";

let server: Server;
let origin: string;
const dialect = new PgDialect();
let row: { marketing: boolean; source?: unknown; captured?: unknown } | undefined;
beforeEach(async () => {
  row = undefined;
  execute.mockReset();
  execute.mockImplementation(async query => {
    const { sql, params } = dialect.sqlToQuery(query);
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DELETE|DROP)\b/i);
    expect(params[0]).toBe("account-A");
    if (/SELECT marketing_consent/i.test(sql)) return { rows: row ? [{ marketing_consent: row.marketing }] : [] };
    if (/INSERT INTO ad_attributions \(user_id, marketing_consent\)/.test(sql)) {
      expect(sql).toMatch(/DO UPDATE SET marketing_consent = EXCLUDED.marketing_consent/);
      expect(sql.split("DO UPDATE")[1]).not.toMatch(/utm_|captured_at/);
      row = { ...row, marketing: params[1] as boolean };
      return { rows: [] };
    }
    // First-touch path: only an empty consent-only row may receive campaign data.
    expect(sql).toContain("WHERE ad_attributions.captured_at IS NULL");
    expect(sql.split("DO UPDATE")[1]).not.toMatch(/marketing_consent\s*=/);
    if (row?.captured || row?.source) return { rows: [] };
    row = { marketing: row?.marketing ?? params[9] as boolean, source: params[1], captured: params[10] };
    return { rows: [{ user_id: "account-A" }] };
  });
  const app = express();
  app.use(express.json()); app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
function patch(value: unknown, authenticated = true) {
  return fetch(`${origin}/api/account/attribution/consent`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...(authenticated ? { "x-test-user": "account-A" } : {}) },
    body: JSON.stringify({ marketingConsent: value, userId: "account-B" }),
  });
}
describe("latest marketing choice, no migrations or backfill", () => {
  it.each([[true, false], [false, true]])("upserts then updates %s → %s for only the authenticated user", async (first, last) => {
    expect((await patch(first)).status).toBe(200);
    expect(await marketingConsentFor("account-A")).toBe(first);
    expect((await patch(last)).status).toBe(200);
    expect(await marketingConsentFor("account-A")).toBe(last);
  });
  it("preserves first-touch fields and can add the first touch after a consent-only row", async () => {
    await patch(true);
    expect(await saveFirstTouch("account-A", { marketingConsent: false, utmSource: "original" })).toEqual({ created: true });
    await patch(false); await patch(true);
    expect(await saveFirstTouch("account-A", { marketingConsent: false, utmSource: "replacement" })).toEqual({ created: false });
    expect(row?.source).toBe("original");
    expect(await marketingConsentFor("account-A")).toBe(true);
  });
  it("requires authentication and a strict boolean without touching storage on invalid input", async () => {
    expect((await patch(true, false)).status).toBe(401);
    expect((await patch("true")).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
