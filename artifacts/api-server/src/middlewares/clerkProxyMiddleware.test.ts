import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLERK_JS_IMMUTABLE_CACHE,
  clerkNpmPath,
  clerkProxyMiddleware,
  fetchClerkNpmAsset,
  versionedClerkJsCacheControl,
} from "./clerkProxyMiddleware";

const script = "clerk-browser";

function redirect(location: string): Response {
  return new Response(null, { status: 307, headers: { location } });
}

function scriptResponse(): Response {
  return new Response(script, { status: 200, headers: { "content-type": "application/javascript" } });
}

describe("clerk npm asset paths", () => {
  it("recognises npm assets and caches only an exact clerk-js version", () => {
    expect(clerkNpmPath("/api/__clerk/v1/client")).toBeNull();
    expect(clerkNpmPath("/api/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js")).toBe(
      "/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    );
    expect(versionedClerkJsCacheControl("/npm/@clerk/clerk-js@6/dist/clerk.browser.js")).toBeNull();
    expect(versionedClerkJsCacheControl("/npm/@clerk/clerk-js@6.42.3/dist/clerk.browser.js")).toBe(CLERK_JS_IMMUTABLE_CACHE);
    expect(versionedClerkJsCacheControl("/npm/@clerk/ui@1.15.0/dist/ui.browser.js")).toBeNull();
  });

  it("follows a same-host https redirect and refuses any other target", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith("@6/dist/clerk.browser.js")) {
        return redirect("https://frontend-api.clerk.dev/npm/@clerk/clerk-js@6.42.3/dist/clerk.browser.js");
      }
      return scriptResponse();
    }) as typeof fetch;
    const ok = await fetchClerkNpmAsset("/npm/@clerk/clerk-js@6/dist/clerk.browser.js", { "Clerk-Secret-Key": "sk_test" }, fetchImpl);
    expect(seen).toEqual([
      "https://frontend-api.clerk.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
      "https://frontend-api.clerk.dev/npm/@clerk/clerk-js@6.42.3/dist/clerk.browser.js",
    ]);
    expect(ok).toMatchObject({ status: 200, body: Buffer.from(script) });

    const evil = await fetchClerkNpmAsset(
      "/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
      {},
      (async () => redirect("https://evil.example/clerk.browser.js")) as typeof fetch,
    );
    expect(evil).toEqual({ error: "redirect" });
  });
});

describe("clerk proxy middleware", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousKey = process.env.CLERK_SECRET_KEY;
  let server: Server | undefined;

  afterEach(async () => {
    process.env.NODE_ENV = previousEnv;
    if (previousKey === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = previousKey;
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it("stays a no-op outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.CLERK_SECRET_KEY = "sk_test";
    const app = express();
    app.use("/api/__clerk", clerkProxyMiddleware({
      fetchImpl: (() => { throw new Error("fetch should not run"); }) as typeof fetch,
    }));
    app.use((_req, res) => res.status(204).end());
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/__clerk/npm/@clerk/clerk-js@6.42.3/dist/clerk.browser.js`);
    expect(response.status).toBe(204);
  });

  it("returns the versioned script with an immutable cache header", async () => {
    process.env.NODE_ENV = "production";
    process.env.CLERK_SECRET_KEY = "sk_test";
    const headers: HeadersInit[] = [];
    const app = express();
    app.use("/api/__clerk", clerkProxyMiddleware({
      fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        headers.push(init?.headers ?? {});
        return scriptResponse();
      }) as typeof fetch,
    }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/__clerk/npm/@clerk/clerk-js@6.42.3/dist/clerk.browser.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(script);
    expect(response.headers.get("cache-control")).toBe(CLERK_JS_IMMUTABLE_CACHE);
    expect(JSON.stringify(headers)).toContain("sk_test");
    expect(response.headers.get("clerk-secret-key")).toBeNull();
  });

  it("does not cache a floating clerk-js tag", async () => {
    process.env.NODE_ENV = "production";
    process.env.CLERK_SECRET_KEY = "sk_test";
    const app = express();
    app.use("/api/__clerk", clerkProxyMiddleware({
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("@6/dist/clerk.browser.js")) {
          return redirect("https://frontend-api.clerk.dev/npm/@clerk/clerk-js@6.42.3/dist/clerk.browser.js");
        }
        return scriptResponse();
      }) as typeof fetch,
    }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(script);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
