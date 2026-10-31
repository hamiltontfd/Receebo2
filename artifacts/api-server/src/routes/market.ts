import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { db, userPreferencesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { UpdateAccountMarketBody, UpdateAccountLanguageBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { lockUserDataMutation } from "../lib/userDataLock";
import { clientPublicIp, suggestMarket } from "../lib/marketGeoip";

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
  const ip = clientPublicIp(req.socket.remoteAddress, req.headers["x-forwarded-for"]);
  res.json(suggestMarket(ip));
});

router.get("/account/market", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const [prefs] = await db.select({ market: userPreferencesTable.market })
    .from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.userId!));
  res.json({ market: prefs?.market ?? null });
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
  res.json(saved);
}));
export default router;
