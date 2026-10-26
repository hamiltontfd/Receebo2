import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owned: true, authenticated: true, download: vi.fn() }));
vi.mock("../lib/subscriptionStatus", () => ({
  getSubscriptionStatus: async () => ({ canUseApp: true, canUpload: true }),
}));
vi.mock("../middlewares/guestAuth", () => ({
  requireAuthOrGuest: (req: any, res: any, next: any) => {
    if (!mocks.authenticated) return res.status(401).json({ error: "Unauthorized" });
    req.userId = "test-user";
    next();
  },
}));
vi.mock("../lib/userDataLock", () => ({ lockUserDataMutation: (handler: unknown) => handler }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock("@workspace/db", () => ({
  receiptsTable: {}, receiptAttachmentsTable: {}, uploadIntentsTable: {},
  db: {
    select: () => {
      const query = {
        from: () => query, innerJoin: () => query, where: () => query,
        limit: async () => mocks.owned ? [{ id: 1 }] : [],
      };
      return query;
    },
  },
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    getObjectEntityFile = async () => ({});
    downloadObject = mocks.download;
  },
}));
import storage from "./storage";

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use("/api", storage);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.owned = true;
  mocks.download.mockImplementation(async () => new Response("private receipt", {
    headers: { "cache-control": "public, max-age=3600", "content-type": "image/png" },
  }));
});

describe("private file cache and ownership", () => {
  it("overrides even public object metadata on the authenticated route", async () => {
    const response = await fetch(`${base}/api/storage/objects/file`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Authorization");
    expect(await response.text()).toBe("private receipt");
  });
  it("requires fresh ownership after switching accounts or deleting the receipt", async () => {
    const first = await fetch(`${base}/api/storage/objects/file?private-cache=no-store`);
    expect(first.status).toBe(200);
    mocks.owned = false;
    const second = await fetch(`${base}/api/storage/objects/file?private-cache=no-store`);
    expect(second.status).toBe(404);
    expect(second.headers.get("cache-control")).toBe("private, no-store");
    expect(await second.text()).not.toContain("private receipt");
    expect(mocks.download).toHaveBeenCalledOnce();
  });
  it("does not cache signed-out responses or upload authorization errors", async () => {
    mocks.authenticated = false;
    for (const path of ["/api/storage/objects/file", "/api/storage/uploads/request-url"]) {
      const response = await fetch(`${base}${path}`, { method: path.includes("uploads") ? "POST" : "GET" });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
