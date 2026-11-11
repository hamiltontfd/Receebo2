/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard — all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Active in production, or explicitly enabled in DEV with CLERK_PROXY_ENABLED.
 *   The historical production-only restriction was a local default, not a
 *   current Clerk limitation: development instances also support FAPI proxying.
 * - A Clerk secret key is required in every environment.
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "http";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
const CLERK_FAPI_HOST = "frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";
export const CLERK_JS_IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const MAX_NPM_REDIRECTS = 3;
const VERSIONED_CLERK_JS = /\/npm\/@clerk\/(?:clerk-js|ui)@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?(?:\/|$)/;

/** Path under the Clerk frontend API, e.g. `/npm/@clerk/clerk-js@6.42.3/dist/clerk.browser.js`. */
export function clerkNpmPath(url: string | undefined): string | null {
  if (!url) return null;
  const path = url.split("?")[0] ?? "";
  const at = path.indexOf("/npm/@clerk/");
  if (at < 0) return null;
  return path.slice(at);
}

/** Long cache only for exact clerk-js/UI versions. Floating tags must stay uncached. */
export function versionedClerkJsCacheControl(npmPath: string): string | null {
  return VERSIONED_CLERK_JS.test(npmPath) ? CLERK_JS_IMMUTABLE_CACHE : null;
}

/**
 * Returns the first effective public hostname for the given request,
 * preferring x-forwarded-host over the Host header so callers behind a
 * proxy see the original client-facing host.
 *
 * x-forwarded-host can take three shapes:
 *   - undefined (no proxy involved)
 *   - a single string (one proxy hop)
 *   - a comma-delimited string when an upstream appended rather than
 *     replaced the header (Node folds duplicate headers this way), or a
 *     string[] in some Express typings
 * In the multi-value case, the leftmost value is the original client-
 * facing host. Take that one in all forms. Exported so that app.ts
 * (clerkMiddleware callback) and this proxy middleware agree on which
 * hostname is canonical — otherwise multi-domain/custom-domain flows
 * break.
 */
export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

function clerkProxyHeaders(req: { headers: IncomingHttpHeaders; socket?: { remoteAddress?: string } }, secretKey: string): Record<string, string> {
  const protocolHeader = req.headers["x-forwarded-proto"] || "https";
  const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
  const host = getClerkProxyHost(req) || "";
  const headers: Record<string, string> = {
    "Clerk-Proxy-Url": `${protocol}://${host}${CLERK_PROXY_PATH}`,
    "Clerk-Secret-Key": secretKey,
  };
  const xff = req.headers["x-forwarded-for"];
  const clientIp =
    (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "";
  if (clientIp) headers["X-Forwarded-For"] = clientIp;
  return headers;
}

/**
 * Clerk answers `/npm/@clerk/clerk-js@6/...` with a 307 to the exact build.
 * http-proxy-middleware would hand that redirect to the browser, and the
 * follow-up request to frontend-api.clerk.dev hangs. Follow it here instead,
 * and only to that host over HTTPS so the proxy cannot be pointed elsewhere.
 * With Clerk-Proxy-Url, Clerk redirects back to our proxy instead: map only
 * that exact origin/path prefix back to FAPI, never fetch our own server.
 */
export async function fetchClerkNpmAsset(
  npmPath: string,
  proxyHeaders: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; contentType: string | null; body: Buffer } | { error: "redirect" }> {
  let current = new URL(npmPath, CLERK_FAPI);
  const proxyUrlHeader = proxyHeaders["Clerk-Proxy-Url"];
  let ownProxy: URL | undefined;
  if (proxyUrlHeader) {
    try {
      const parsed = new URL(proxyUrlHeader);
      if (parsed.protocol === "https:" && parsed.pathname === CLERK_PROXY_PATH &&
        !parsed.username && !parsed.password) ownProxy = parsed;
    } catch {
      return { error: "redirect" };
    }
  }
  for (let hop = 0; hop <= MAX_NPM_REDIRECTS; hop++) {
    if (current.protocol !== "https:" || current.host !== CLERK_FAPI_HOST ||
      current.username || current.password) return { error: "redirect" };
    const response = await fetchImpl(current, { redirect: "manual", headers: proxyHeaders });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      // Opaque redirects expose status 0. Never pass an invalid HTTP status
      // or an unsupported 3xx response to Express.
      if (!Number.isInteger(response.status) || response.status < 200 || response.status > 599 ||
        (response.status >= 300 && response.status < 400)) return { error: "redirect" };
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: Buffer.from(await response.arrayBuffer()),
      };
    }
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) return { error: "redirect" };
    try {
      const target = new URL(location, current);
      if (ownProxy && target.origin === ownProxy.origin &&
        target.pathname.startsWith(`${ownProxy.pathname}/npm/@clerk/`) &&
        !target.username && !target.password) {
        current = new URL(target.pathname.slice(ownProxy.pathname.length) + target.search, CLERK_FAPI);
      } else {
        current = target;
      }
    } catch {
      return { error: "redirect" };
    }
  }
  return { error: "redirect" };
}

export function clerkProxyMiddleware(options?: { fetchImpl?: typeof fetch }): RequestHandler {
  // Preserve production behavior; non-production must opt in explicitly.
  const explicitlyEnabled = /^(1|true|yes|on)$/i.test(process.env.CLERK_PROXY_ENABLED?.trim() ?? "");
  if (process.env.NODE_ENV !== "production" && !explicitlyEnabled) {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  const apiProxy = createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        for (const [name, value] of Object.entries(clerkProxyHeaders(req, secretKey))) {
          proxyReq.setHeader(name, value);
        }
      },
    },
  }) as RequestHandler;

  return (req, res, next) => {
    const npmPath = clerkNpmPath(req.originalUrl || req.url);
    if (!npmPath) {
      apiProxy(req, res, next);
      return;
    }
    const query = (req.originalUrl || req.url).includes("?")
      ? (req.originalUrl || req.url).slice((req.originalUrl || req.url).indexOf("?"))
      : "";
    void fetchClerkNpmAsset(npmPath + query, clerkProxyHeaders(req, secretKey), options?.fetchImpl)
      .then((result) => {
        if ("error" in result) {
          res.status(502).end();
          return;
        }
        if (result.contentType) res.setHeader("Content-Type", result.contentType);
        const cache = versionedClerkJsCacheControl(npmPath);
        res.setHeader("Cache-Control", result.status >= 200 && result.status < 300 && cache ? cache : "private, no-store");
        res.status(result.status).send(result.body);
      })
      .catch(() => {
        if (!res.headersSent) res.status(502).end();
      });
  };
}
