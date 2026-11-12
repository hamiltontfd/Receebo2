import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { saveFirstTouch, updateMarketingConsent } from "../lib/adAttributionStore";

const router: IRouter = Router();

router.patch("/account/attribution/consent", requireAuth, async (req, res): Promise<void> => {
  if (typeof req.body?.marketingConsent !== "boolean") {
    res.status(400).json({ error: "marketingConsent must be a boolean" });
    return;
  }
  await updateMarketingConsent(req.userId!, req.body.marketingConsent);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ marketingConsent: req.body.marketingConsent });
});

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 120);
  return trimmed || undefined;
}

/**
 * First-touch campaign fields for this account. Saving attribution never emits
 * a registration event; registration belongs to creation of the trial.
 * DRAFT pending legal review.
 */
router.post("/account/attribution", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const marketingConsent = body.marketingConsent === true;
  const saved = await saveFirstTouch(req.userId!, {
    utmSource: text(body.utmSource),
    utmMedium: text(body.utmMedium),
    utmCampaign: text(body.utmCampaign),
    utmContent: text(body.utmContent),
    utmTerm: text(body.utmTerm),
    fbclid: text(body.fbclid),
    fbc: text(body.fbc),
    fbp: text(body.fbp),
    marketingConsent,
    capturedAt: text(body.capturedAt),
  });
  res.json({ created: saved.created });
});

export default router;
