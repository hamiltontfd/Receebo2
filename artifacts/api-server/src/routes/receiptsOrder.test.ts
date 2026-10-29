import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, receiptsTable } from "@workspace/db";
import { decodeReceiptCursor, encodeReceiptCursor, sortDayOf } from "../lib/receiptOrder";

// Auth is replaced for the local HTTP harness; the query runs on local PostgreSQL.
vi.mock("../middlewares/guestAuth", () => ({
  requireAuthOrGuest: (req: any, res: any, next: any) => {
    req.userId = req.headers["x-test-user"];
    return req.userId ? next() : res.sendStatus(401);
  },
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {},
  objectStorageClient: {},
}));

import receipts from "./receipts";

let server: Server;
let base: string;
const users: string[] = [];

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(receipts);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  for (const id of users) await db.delete(receiptsTable).where(eq(receiptsTable.userId, id));
});

function newUser() {
  const id = `order-fixture-${randomUUID()}`;
  users.push(id);
  return id;
}
async function seed(user: string, rows: Array<{ merchant: string; purchaseDate: string | null; createdAt: string; isDraft?: boolean }>) {
  await db.insert(receiptsTable).values(rows.map((r) => ({
    userId: user, merchant: r.merchant, purchaseDate: r.purchaseDate, createdAt: new Date(r.createdAt),
    isDraft: r.isDraft ?? false, status: "completed", objectPath: `/objects/${randomUUID()}`,
    originalFileName: "r.pdf", contentType: "application/pdf",
  })));
}
async function list(user: string, query = "") {
  const res = await fetch(`${base}/receipts${query}`, { headers: { "x-test-user": user } });
  expect(res.status).toBe(200);
  return (await res.json()) as { items: Array<{ merchant: string }>; nextCursor: string | null };
}
async function listAll(user: string, limit: number) {
  const names: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const page = await list(user, `?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    names.push(...page.items.map((r) => r.merchant));
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return names;
}

describe("GET /receipts order", () => {
  it("lists by receipt date, not by when the receipt was imported", async () => {
    const user = newUser();
    // Scanned in August, then old receipts imported from Outlook today (newest import = oldest purchase).
    await seed(user, [
      { merchant: "Scanned Aug", purchaseDate: "2026-08-10", createdAt: "2026-08-10T12:00:00Z" },
      { merchant: "Imported Mar", purchaseDate: "2026-03-02", createdAt: "2026-10-29T09:00:00Z" },
      { merchant: "Imported Oct", purchaseDate: "2026-10-20", createdAt: "2026-10-29T08:00:00Z" },
      { merchant: "Imported 2025", purchaseDate: "2025-12-24", createdAt: "2026-10-29T10:00:00Z" },
      { merchant: "No date", purchaseDate: null, createdAt: "2026-09-15T10:00:00Z" },
      { merchant: "Draft", purchaseDate: "2026-10-28", createdAt: "2026-10-28T10:00:00Z", isDraft: true },
    ]);
    const page = await list(user);
    expect(page.items.map((r) => r.merchant)).toEqual([
      "Imported Oct", "No date", "Scanned Aug", "Imported Mar", "Imported 2025",
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("caps a purchase date after the day it was added (OCR typo) to that day", async () => {
    const user = newUser();
    await seed(user, [
      { merchant: "Typo 2062", purchaseDate: "2062-01-05", createdAt: "2026-05-01T10:00:00Z" },
      { merchant: "June", purchaseDate: "2026-06-01", createdAt: "2026-06-01T10:00:00Z" },
    ]);
    expect((await list(user)).items.map((r) => r.merchant)).toEqual(["June", "Typo 2062"]);
  });

  it("pages through every receipt once, in order, including same-day ties", async () => {
    const user = newUser();
    const rows = Array.from({ length: 11 }, (_, i) => ({
      merchant: `R${String(i).padStart(2, "0")}`,
      // Pairs share a purchase day; some share the same added instant too.
      purchaseDate: `2026-0${9 - Math.floor(i / 2)}-01`,
      createdAt: i % 3 === 0 ? "2026-10-29T10:00:00.000Z" : `2026-10-${10 + i}T10:00:00Z`,
    }));
    await seed(user, rows);
    const all = await listAll(user, 50);
    expect(all).toHaveLength(11);
    for (const size of [1, 2, 3, 4]) expect(await listAll(user, size)).toEqual(all);
    // Newest purchase day first.
    expect(all.slice(0, 2).sort()).toEqual(["R00", "R01"]);
    expect(all.at(-1)).toBe("R10");
  });

  it("search results use the same order", async () => {
    const user = newUser();
    await seed(user, [
      { merchant: "Shop old", purchaseDate: "2026-01-01", createdAt: "2026-10-29T10:00:00Z" },
      { merchant: "Shop new", purchaseDate: "2026-10-01", createdAt: "2026-10-02T10:00:00Z" },
    ]);
    expect((await list(user, "?q=Shop")).items.map((r) => r.merchant)).toEqual(["Shop new", "Shop old"]);
  });

  it("an old timestamp cursor starts again from the top instead of failing", async () => {
    const user = newUser();
    await seed(user, [{ merchant: "Only", purchaseDate: "2026-10-01", createdAt: "2026-10-02T10:00:00Z" }]);
    const page = await list(user, `?cursor=${encodeURIComponent("2026-10-29T10:00:00.000Z")}`);
    expect(page.items.map((r) => r.merchant)).toEqual(["Only"]);
  });
});

describe("receipt cursor", () => {
  it("round-trips and rejects junk", () => {
    const c = encodeReceiptCursor({ id: 42, purchaseDate: "2026-03-02", createdAt: new Date("2026-10-29T09:00:00.123Z") });
    expect(decodeReceiptCursor(c)).toEqual({ day: "2026-03-02", createdAt: "2026-10-29T09:00:00.123Z", id: 42 });
    expect(decodeReceiptCursor("2026-10-29T09:00:00.000Z")).toBeNull();
    expect(decodeReceiptCursor("x_y_1")).toBeNull();
    expect(decodeReceiptCursor(undefined)).toBeNull();
  });
  it("sort day falls back to the added day and caps future dates", () => {
    expect(sortDayOf({ purchaseDate: null, createdAt: "2026-09-15T23:30:00Z" })).toBe("2026-09-15");
    expect(sortDayOf({ purchaseDate: "2062-01-05", createdAt: "2026-05-01T10:00:00Z" })).toBe("2026-05-01");
    expect(sortDayOf({ purchaseDate: "2026-03-02", createdAt: "2026-10-29T10:00:00Z" })).toBe("2026-03-02");
  });
});
