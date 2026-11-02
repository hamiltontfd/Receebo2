import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { createHash, randomBytes } from "node:crypto";
import { clientPublicIp } from "../lib/marketGeoip";
import { parseLandingEvent, recordLandingEvent } from "../lib/landingEvents";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Public, anonymous beacon from the landing pages. Aggregate counts only (see
// lib/landingEvents). Limits are in memory: a global budget, and a per-client
// one keyed by a salted hash of the verified client IP (salt per process, never
// stored, nothing logged).
const salt = randomBytes(16);
const globalLimit = rateLimit({
  windowMs: 60_000, limit: 600, keyGenerator: () => "landing-events",
  standardHeaders: "draft-8", legacyHeaders: false, validate: { xForwardedForHeader: false },
});
const clientLimit = rateLimit({
  windowMs: 10 * 60_000, limit: 30,
  keyGenerator: (req) => {
    const ip = clientPublicIp(req.socket.remoteAddress, req.headers["x-forwarded-for"]);
    return ip ? createHash("sha256").update(salt).update(ip).digest("base64url").slice(0, 22) : "unknown-client";
  },
  skip: (req) => !clientPublicIp(req.socket.remoteAddress, req.headers["x-forwarded-for"]),
  standardHeaders: "draft-8", legacyHeaders: false, validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

router.post("/landing/event", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, globalLimit, clientLimit, async (req, res): Promise<void> => {
  const input = parseLandingEvent(req.body);
  if (!input) {
    res.status(400).json({ error: "Unknown event." });
    return;
  }
  try {
    await recordLandingEvent(input);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Could not record landing event");
    res.status(503).json({ error: "Try again later." });
  }
});

export default router;
