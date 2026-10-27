import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => vi.fn());
vi.mock("../lib/orphanCleanup", () => ({ runDailyMaintenanceIfDue: run }));

import cronRouter, { cronSecretMatches } from "./cron";

let base = "";
let server: ReturnType<express.Express["listen"]>;
beforeAll(async () => {
  const app = express();
  app.use("/api", cronRouter);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/cron/daily-maintenance`;
});
afterAll(() => { server.close(); });
beforeEach(() => { run.mockReset().mockResolvedValue(true); delete process.env.CRON_SECRET; });

describe("cron endpoint", () => {
  it("compares secrets safely", () => {
    expect(cronSecretMatches("abc", "abc")).toBe(true);
    expect(cronSecretMatches("abd", "abc")).toBe(false);
    expect(cronSecretMatches("", "abc")).toBe(false);
    expect(cronSecretMatches(undefined, "abc")).toBe(false);
    expect(cronSecretMatches("abc", undefined)).toBe(false);
  });
  it("is disabled (503) without CRON_SECRET", async () => {
    const res = await fetch(base, { method: "POST", headers: { "x-cron-secret": "anything" } });
    expect(res.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects a missing or wrong secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    expect((await fetch(base, { method: "POST" })).status).toBe(401);
    expect((await fetch(base, { method: "POST", headers: { "x-cron-secret": "wrong" } })).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it("runs the daily maintenance with the right secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    const res = await fetch(base, { method: "POST", headers: { "x-cron-secret": "test-secret-value" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: true });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
