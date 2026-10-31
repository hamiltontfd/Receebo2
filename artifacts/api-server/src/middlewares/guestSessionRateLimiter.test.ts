import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { guestSessionRateLimiter } from "./guestSessionRateLimiter";

let server: Server | undefined;
afterAll(() => new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()));
describe("guest creation trust boundary", () => {
  it("cannot reset the socket-peer budget by forging forwarding headers", async () => {
    const app = express();
    expect(app.get("trust proxy")).toBe(false);
    app.post("/guest-session", guestSessionRateLimiter, (_req, res) => { res.sendStatus(201); });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${base}/guest-session`, {
        method: "POST", headers: { "x-real-ip": `8.8.8.${i}`, "cf-connecting-ip": `8.8.8.${i}` },
      });
      expect(res.status).toBe(201);
    }
    const blocked = await fetch(`${base}/guest-session`, {
      method: "POST", headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "1.1.1.1", "forwarded": "for=1.1.1.1" },
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
