// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createUploadGrants, gatePrefix, grantLifetimeMs, uploadHandler, validateUploadGrant } from "./promo-upload-gate";

const key = Buffer.alloc(32, 0x42);
const deadline = Date.now() + grantLifetimeMs;
const grants = createUploadGrants("https://example.replit.dev", key, deadline);

describe("temporary DEV promo upload capabilities", () => {
  it("signs exactly 18 named v4 promo objects for two hours, with no v3 or arbitrary files", () => {
    expect(grants).toHaveLength(18);
    expect(new Set(grants.map(g => g.pathname)).size).toBe(18);
    for (const grant of grants) {
      expect(grant.pathname).toMatch(/^marketing\/receebo-real-app\/v4\/(eu|us|br)\/receebo-promo-(16x9|9x16)(\.(mp4|webm)|-poster\.webp)$/);
      expect(new URL(grant.url).searchParams.get("expires")).toBe(String(deadline));
    }
  });
  it("rejects expiry, altered paths/signatures, non-PUT methods and extended deadlines", () => {
    const target = new URL(grants[0].url);
    const request = `${target.pathname}${target.search}`;
    expect(validateUploadGrant(key, "PUT", request, deadline - 1, deadline)).toBe("eu/receebo-promo-16x9.mp4");
    expect(validateUploadGrant(key, "PUT", request, deadline, deadline)).toBeNull();
    expect(validateUploadGrant(key, "GET", request, 0, deadline)).toBeNull();
    expect(validateUploadGrant(key, "POST", request, 0, deadline)).toBeNull();
    expect(validateUploadGrant(key, "PUT", request.replace("/eu/", "/us/"), 0, deadline)).toBeNull();
    expect(validateUploadGrant(key, "PUT", request.replace("16x9", "anything"), 0, deadline)).toBeNull();
    expect(validateUploadGrant(key, "PUT", request, 0, deadline + 1)).toBeNull();
    expect(validateUploadGrant(Buffer.alloc(32), "PUT", request, 0, deadline)).toBeNull();
  });
});

describe("upload transport (fake GCS, no database or real storage)", () => {
  let server: Server;
  let origin: string;
  let exists = false;
  const createStream = vi.fn((_name: string, _options: unknown) => new Writable({
    write(_chunk, _encoding, done) { done(); },
    final(done) {
      if (exists) done(Object.assign(new Error("precondition failed"), { code: 412 }));
      else { exists = true; done(); }
    },
  }));
  beforeAll(async () => {
    server = createServer((req, res) => { void uploadHandler(key, deadline, createStream)(req, res); });
    server.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => new Promise<void>(resolve => server.close(() => resolve())));
  const target = () => { const u = new URL(grants[0].url); return `${origin}${u.pathname}${u.search}`; };
  it("rejects invalid or unsigned requests before opening a storage stream", async () => {
    expect((await fetch(`${origin}${gatePrefix}eu/receebo-promo-16x9.mp4`, { method: "PUT" })).status).toBe(403);
    expect((await fetch(target(), { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "bad" })).status).toBe(415);
    expect(createStream).not.toHaveBeenCalled();
  });
  it("allows preflight for a valid grant without opening storage", async () => {
    const response = await fetch(target(), { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("PUT, OPTIONS");
    expect(createStream).not.toHaveBeenCalled();
  });
  it("streams with create-only and public metadata; a repeat PUT returns 412, never overwrites", async () => {
    const init = { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: "fictional test bytes" };
    expect((await fetch(target(), init)).status).toBe(201);
    expect(createStream).toHaveBeenLastCalledWith("eu/receebo-promo-16x9.mp4", expect.objectContaining({
      resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: expect.objectContaining({ contentType: "video/mp4", cacheControl: "public, max-age=86400" }),
    }));
    expect((await fetch(target(), init)).status).toBe(412);
  });
});
