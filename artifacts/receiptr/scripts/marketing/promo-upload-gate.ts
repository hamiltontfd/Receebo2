import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Writable } from "node:stream";
import type { Plugin } from "vite";
import { objectStorageClient, ObjectStorageService } from "../../../api-server/src/lib/objectStorage";
import { markets, promoFiles, v4Prefix } from "./upload-v4";

// Native sidecar URLs cannot bind generation preconditions. This opt-in,
// DEV-only capability endpoint enforces them at GCS instead. No database,
// account auth changes, production route, persistent key, or broad upload scope.
export const gatePrefix = "/__marketing-v4-upload/";
export const grantLifetimeMs = 120 * 60 * 1000;
export const grantFile = path.join(tmpdir(), "receebo-marketing-v4-upload-grants.json");
const names = new Set(markets.flatMap(market => promoFiles.map(file => `${market}/${file}`)));
const contentType = (file: string) => file.endsWith(".webp") ? "image/webp" : file.endsWith(".webm") ? "video/webm" : "video/mp4";
const mac = (key: Buffer, pathname: string, expires: number) =>
  createHmac("sha256", key).update(`PUT\n${pathname}\n${expires}`).digest("hex");

export function createUploadGrants(origin: string, key: Buffer, expires: number) {
  return [...names].map(name => {
    const pathname = `${gatePrefix}${name}`;
    const url = new URL(pathname, origin);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("signature", mac(key, pathname, expires));
    return { pathname: `${v4Prefix}/${name}`, url: url.href, contentType: contentType(name) };
  });
}

export function validateUploadGrant(key: Buffer, method: string | undefined, target: string, now: number, deadline: number): string | null {
  if (method !== "PUT") return null;
  const url = new URL(target, "http://dev.invalid");
  if (!url.pathname.startsWith(gatePrefix)) return null;
  const name = url.pathname.slice(gatePrefix.length);
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  if (!names.has(name) || !Number.isSafeInteger(expires) || expires !== deadline || now >= expires) return null;
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mac(key, url.pathname, expires), "hex")) ? name : null;
}

type CreateStream = (name: string, options: {
  resumable: false;
  preconditionOpts: { ifGenerationMatch: 0 };
  metadata: { contentType: string; cacheControl: string; metadata: Record<string, string> };
}) => Writable;

export function uploadHandler(key: Buffer, deadline: number, createStream: CreateStream) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const name = validateUploadGrant(key, req.method === "OPTIONS" ? "PUT" : req.method, req.url ?? "", Date.now(), deadline);
    res.setHeader("Cache-Control", "no-store");
    if (!name) { res.writeHead(403).end("Invalid or expired DEV upload grant"); return; }
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.writeHead(204).end(); return;
    }
    const expected = contentType(name);
    if (req.headers["content-type"]?.split(";")[0].trim() !== expected) {
      res.writeHead(415).end(`Use Content-Type: ${expected}`); return;
    }
    let bytes = 0;
    const limit = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > 100 * 1024 * 1024 ? new Error("Upload exceeds 100 MiB") : null, chunk);
      },
    });
    try {
      const destination = createStream(name, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: expected, cacheControl: "public, max-age=86400",
          metadata: { "custom:aclPolicy": JSON.stringify({ owner: "marketing-assets", visibility: "public" }) },
        },
      });
      await pipeline(req, limit, destination);
      res.writeHead(201).end("Created");
    } catch (error) {
      if (!res.destroyed) res.writeHead((error as { code?: number }).code === 412 ? 412 : 502)
        .end((error as { code?: number }).code === 412 ? "Object exists; left untouched" : "Upload failed; no overwrite permitted");
    }
  };
}

export function promoUploadGate(repo: string): Plugin {
  return {
    name: "receebo-dev-only-promo-upload",
    apply: "serve",
    async configureServer(server) {
      if (server.config.mode !== "development") return;
      const marker = path.join(repo, "generated-artifacts/marketing-v4/enable-promo-upload.json");
      if (!existsSync(marker) || !process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev")) return;
      const { expiresAt } = JSON.parse(await readFile(marker, "utf8"));
      const deadline = Number(expiresAt);
      if (!Number.isSafeInteger(deadline) || deadline <= Date.now() || deadline > Date.now() + grantLifetimeMs) {
        throw new Error("DEV promo upload activation must expire within 120 minutes");
      }
      const key = randomBytes(32); // In memory only; restart invalidates old grants.
      const grants = createUploadGrants(`https://${process.env.REPLIT_DEV_DOMAIN}`, key, deadline);
      await writeFile(grantFile, JSON.stringify({ expiresAt: new Date(deadline).toISOString(), grants }, null, 2), { mode: 0o600 });
      const [bucket, ...prefix] = new ObjectStorageService().getPublicObjectSearchPaths()[0].replace(/^\/+/, "").split("/");
      const handler = uploadHandler(key, deadline, (name, options) =>
        objectStorageClient.bucket(bucket).file([...prefix, v4Prefix, name].filter(Boolean).join("/")).createWriteStream(options));
      server.middlewares.use((req, res, next) => {
        if (!(req.url ?? "").startsWith(gatePrefix)) { next(); return; }
        void handler(req, res).catch(() => { if (!res.destroyed) res.writeHead(502).end("Upload failed"); });
      });
    },
  };
}
