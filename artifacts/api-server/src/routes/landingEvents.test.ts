import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import landingEvents from "./landingEvents";
import { parseLandingEvent } from "../lib/landingEvents";

let server: Server;
let base: string;
const tag = `t${Date.now().toString(36)}`;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), landingEvents);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await db.execute(sql`DELETE FROM landing_event_counts WHERE utm_content LIKE ${tag + "%"}`);
});
const post = (body: unknown) => fetch(`${base}/landing/event`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const count = async (event: string, path: string, utm: string) => {
  const r = await db.execute(sql`SELECT coalesce(sum(count), 0)::int AS n FROM landing_event_counts WHERE event = ${event} AND path = ${path} AND utm_content = ${utm}`);
  return Number((r.rows[0] as { n: number }).n);
};

describe("landing counts (aggregate only, real PostgreSQL)", () => {
  it("counts views and CTA clicks per day, path and utm_content; nothing about the visitor", async () => {
    const res = await post({ event: "landing_view", path: "/us", utmContent: `${tag}-bf-tv` });
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
    await post({ event: "landing_view", path: "/us", utmContent: `${tag}-BF-TV` });
    await post({ event: "cta_click", path: "/us", utmContent: `${tag}-bf-tv` });
    expect(await count("landing_view", "/us", `${tag}-bf-tv`)).toBe(2);
    expect(await count("cta_click", "/us", `${tag}-bf-tv`)).toBe(1);
    const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'landing_event_counts' ORDER BY column_name`);
    expect((cols.rows as Array<{ column_name: string }>).map((r) => r.column_name)).toEqual(["count", "day", "event", "path", "utm_content"]);
  });

  it("rejects unknown events and paths; free-text utm_content is never stored", async () => {
    for (const body of [{}, { event: "signup", path: "/us" }, { event: "landing_view", path: "/settings" }, null]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(parseLandingEvent({ event: "landing_view", path: "/", utmContent: "jane@example.com" })?.utmContent).toBe("(other)");
    expect(parseLandingEvent({ event: "landing_view", path: "/", utmContent: "x".repeat(41) })?.utmContent).toBe("(other)");
    expect(parseLandingEvent({ event: "landing_view", path: "/" })?.utmContent).toBe("(none)");
    expect(parseLandingEvent({ event: "cta_click", path: "/us", utmContent: " BF_tv-1 " })?.utmContent).toBe("bf_tv-1");
  });
});
