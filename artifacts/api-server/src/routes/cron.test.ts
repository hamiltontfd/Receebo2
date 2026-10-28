import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => vi.fn());
const sweep = vi.hoisted(() => vi.fn());
vi.mock("../lib/orphanCleanup", () => ({ runDailyMaintenanceIfDue: run }));
vi.mock("../lib/outlookSync", () => ({ runOutlookSweep: sweep }));

import cronRouter, { cronSecretMatches } from "./cron";

let base = "";
let mailSync = "";
let server: ReturnType<express.Express["listen"]>;
beforeAll(async () => {
  const app = express();
  app.use("/api", cronRouter);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/cron`;
  base = `${root}/daily-maintenance`;
  mailSync = `${root}/mail-sync`;
});
afterAll(() => { server.close(); });
const SWEEP_OK = { status: "ok", due: 1, synced: 1, failed: 0, queued: 2, remaining: 0 };
beforeEach(() => { run.mockReset().mockResolvedValue(true); sweep.mockReset().mockResolvedValue(SWEEP_OK); delete process.env.CRON_SECRET; });

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
    expect(sweep).not.toHaveBeenCalled();
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
    expect(await res.json()).toEqual({ ran: true, outlook: SWEEP_OK });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
  it("still answers when the Outlook sweep fails, and runs the sweep even if maintenance already ran today", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    run.mockResolvedValue(false);
    sweep.mockRejectedValue(new Error("graph down"));
    const res = await fetch(base, { method: "POST", headers: { "x-cron-secret": "test-secret-value" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: false, outlook: { status: "error" } });
  });
});

describe("mail-sync cron endpoint (every 4 h)", () => {
  const post = (headers: Record<string, string> = {}) => fetch(mailSync, { method: "POST", headers });
  it("is disabled (503) without CRON_SECRET", async () => {
    const res = await post({ "x-cron-secret": "anything" });
    expect(res.status).toBe(503);
    expect(sweep).not.toHaveBeenCalled();
  });
  it("rejects a missing or wrong secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    expect((await post()).status).toBe(401);
    expect((await post({ "x-cron-secret": "wrong" })).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });
  it("runs only the mail sweep, never the daily maintenance (reminder emails)", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    const res = await post({ "x-cron-secret": "test-secret-value" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outlook: SWEEP_OK });
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });
  it("reports a failed sweep as 500 so the scheduler flags it", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    sweep.mockRejectedValue(new Error("graph down"));
    const res = await post({ "x-cron-secret": "test-secret-value" });
    expect(res.status).toBe(500);
    expect(run).not.toHaveBeenCalled();
  });
});
