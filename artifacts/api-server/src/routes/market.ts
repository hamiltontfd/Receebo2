import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { db, userPreferencesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { UpdateAccountMarketBody, UpdateAccountLanguageBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { lockUserDataMutation } from "../lib/userDataLock";
import { createHash, randomBytes } from "node:crypto";
import { clientPublicIp, requestCountry } from "../lib/marketGeoip";
import { interestCountry, recordMarketInterest } from "../lib/marketInterest";
import { setMarketIfUnset } from "../lib/accountMarket";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.get("/account/language", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const [prefs] = await db.select({ language: userPreferencesTable.language })
    .from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.userId!));
  res.json({ language: prefs?.language ?? null });
});
router.patch("/account/language", requireAuth, lockUserDataMutation(async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = UpdateAccountLanguageBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose en, pt-PT, pt-BR or null." });
    return;
  }
  const { language } = parsed.data;
  const [saved] = await db.insert(userPreferencesTable).values({ userId: req.userId!, language })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: { language, updatedAt: new Date() },
    }).returning({ language: userPreferencesTable.language });
  res.json(saved);
}));
/**
 * The signed-in app reports the browser's resolved language (en / pt-PT /
 * pt-BR; anything else en) for emails. Requires legal consent (not exempt).
 * Never touches the manual `language`; written only while it is null, and
 * only when the value changes (the timestamp marks the last change).
 */
router.put("/account/detected-language", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const value = (req.body as { language?: unknown } | undefined)?.language;
  if (value !== "en" && value !== "pt-PT" && value !== "pt-BR") {
    res.status(400).json({ error: "Choose en, pt-PT or pt-BR." });
    return;
  }
  const now = new Date();
  const result = await db.execute(sql`
    INSERT INTO user_preferences (user_id, detected_language, detected_language_at)
    VALUES (${req.userId!}, ${value}, ${now})
    ON CONFLICT (user_id) DO UPDATE SET detected_language = EXCLUDED.detected_language,
      detected_language_at = EXCLUDED.detected_language_at, updated_at = now()
    WHERE user_preferences.language IS NULL
      AND user_preferences.detected_language IS DISTINCT FROM EXCLUDED.detected_language
    RETURNING detected_language`);
  res.json({ stored: result.rows.length > 0 });
});

// Fixed-size global budget: no IP keys retained/logged, no attacker-controlled key cardinality.
const suggestionLimit = rateLimit({
  windowMs: 60_000, limit: 600, keyGenerator: () => "market-suggestions",
  standardHeaders: "draft-8", legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});
router.get("/market/suggestion", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
}, suggestionLimit, (req, res) => {
  res.json(requestCountry(req));
});

/**
 * The account market, plus the country detected from this request (never
 * stored). Requires legal consent (requireAuth, not exempt), so nothing is
 * written before it. An account without a market gets the IP's market on the
 * first request after consent (first write wins; a saved/manual market is
 * never replaced). Unknown or uncovered
 * countries leave it empty: PT/EU rules apply and the app shows the notice.
 */
router.get("/account/market", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const [prefs] = await db.select({ market: userPreferencesTable.market })
    .from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.userId!));
  const detected = requestCountry(req);
  let market = prefs?.market ?? null;
  if (!market && detected.market) {
    try {
      market = await setMarketIfUnset(req.userId!, detected.market);
      logger.info({ userId: req.userId, market }, "Account market set from server-side GeoIP");
    } catch (err) {
      logger.warn({ err, userId: req.userId }, "Could not save the detected market; leaving it unset");
    }
  }
  res.json({ market, country: detected.country });
});

router.patch("/account/market", requireAuth, lockUserDataMutation(async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = UpdateAccountMarketBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose PT, BR or US." });
    return;
  }
  const { market, onlyIfUnset } = parsed.data;
  const [saved] = await db.insert(userPreferencesTable).values({ userId: req.userId!, market })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: {
        market: onlyIfUnset ? sql`coalesce(${userPreferencesTable.market}, ${market})` : market,
        updatedAt: new Date(),
      },
    }).returning({ market: userPreferencesTable.market });
  res.json({ ...saved, country: requestCountry(req).country });
}));
// "I'm interested" (uncovered countries): aggregate counts only. Two in-memory
// limits: a global budget, and a per-client one keyed by a salted hash of the
// verified client IP (salt is per process, never stored; nothing is logged).
const interestSalt = randomBytes(16);
const interestGlobalLimit = rateLimit({
  windowMs: 60_000, limit: 120, keyGenerator: () => "market-interest",
  standardHeaders: "draft-8", legacyHeaders: false, validate: { xForwardedForHeader: false },
});
const interestClientLimit = rateLimit({
  windowMs: 60 * 60_000, limit: 5,
  keyGenerator: (req) => {
    const ip = clientPublicIp(req.socket.remoteAddress, req.headers["x-forwarded-for"]);
    return ip ? createHash("sha256").update(interestSalt).update(ip).digest("base64url").slice(0, 22) : "unknown-client";
  },
  skip: (req) => !clientPublicIp(req.socket.remoteAddress, req.headers["x-forwarded-for"]),
  standardHeaders: "draft-8", legacyHeaders: false, validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});
/**
 * Public (visitors and accounts). Body { country }. The server-detected country
 * wins when there is one; otherwise the client's (which itself came from the
 * server's suggestion or account response). Covered countries are refused.
 */
router.post("/market/interest", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, interestGlobalLimit, interestClientLimit, async (req, res): Promise<void> => {
  const detected = requestCountry(req).country;
  const country = interestCountry(detected ?? (req.body as { country?: unknown } | undefined)?.country);
  if (!country) {
    res.status(400).json({ error: "Choose a country Receebo doesn't cover yet." });
    return;
  }
  try {
    await recordMarketInterest(country);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Could not record market interest");
    res.status(503).json({ error: "Try again later." });
  }
});
export default router;
