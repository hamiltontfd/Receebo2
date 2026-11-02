import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("../dist/public/", import.meta.url));
const publicRoutes = new Map([["/", "index.html"], ["/privacy", "privacy/index.html"], ["/terms", "terms/index.html"]]);
const clientRoute = /^(?:\/(?:us|search(?:\/worth-keeping)?|stats|scan|imports|settings|profile(?:\/recurring)?|get-started)|\/receipts\/[^/]+|\/sign-(?:in|up)(?:\/.*)?)$/;
const types = {
  ".html": "text/html; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm",
};

/** No API imports: serving public HTML must never start integration jobs. */
export function publicHandler({ root = defaultRoot, base = "/" } = {}) {
  const prefix = base.replace(/\/$/, "");
  return async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { Allow: "GET, HEAD" }).end(); return;
      }
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (prefix && pathname === prefix) {
        res.writeHead(308, { Location: `${prefix}/${new URL(req.url, "http://localhost").search}` }).end(); return;
      }
      const scoped = !prefix || pathname.startsWith(`${prefix}/`);
      let route;
      try { route = decodeURIComponent(pathname.slice(prefix.length)); }
      catch { res.writeHead(400).end(); return; }
      const normalized = route.replace(/\/$/, "") || "/";
      const publicFile = scoped && publicRoutes.get(normalized);
      if (publicFile && normalized !== route && normalized !== "/") {
        res.writeHead(308, { Location: `${prefix}${normalized}${new URL(req.url, "http://localhost").search}` }).end(); return;
      }
      let status = 200;
      let filename = publicFile || (scoped && clientRoute.test(normalized) ? "app.html" : null);
      if (!filename && scoped && !route.includes("\\") && !route.includes("\0")) {
        const candidate = path.resolve(root, `.${route}`);
        if (candidate.startsWith(`${path.resolve(root)}${path.sep}`) &&
            !route.split("/").some(part => part.startsWith(".")) &&
            !["/index.html", "/app.html", "/privacy/index.html", "/terms/index.html", "/404.html"].includes(route)) {
          try { if ((await stat(candidate)).isFile()) filename = path.relative(root, candidate); } catch { /* missing asset */ }
        }
      }
      if (!filename) { status = 404; filename = "404.html"; }
      const file = path.join(root, filename);
      const info = await stat(file);
      const html = filename.endsWith(".html");
      res.setHeader("Content-Type", types[path.extname(filename)] ?? "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", filename.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      if (html && !publicFile) res.setHeader("X-Robots-Tag", "noindex, follow");
      res.setHeader("Accept-Ranges", "bytes");
      let start = 0, end = info.size - 1;
      if (req.headers.range && status === 200 && !html) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) {
          res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end(); return;
        }
        start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end || start >= info.size) {
          res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end(); return;
        }
        status = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
      }
      res.setHeader("Content-Length", Math.max(0, end - start + 1));
      res.writeHead(status);
      if (req.method === "HEAD" || info.size === 0) res.end();
      else createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      console.error("Public delivery failed:", error.code ?? error.message);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error("A valid PORT is required");
  http.createServer(publicHandler({ base: process.env.BASE_PATH || "/" }))
    .listen(port, "0.0.0.0", () => console.log(`Receebo public server listening on ${port}`));
}
