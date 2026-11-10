import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { saveFirstTouch } from "../lib/adAttributionStore";
import { sendMetaEvent } from "../lib/metaCapi";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 120);
  return trimmed || undefined;
}

/**
 * First-touch campaign fields for this account. Marketing events are sent only
 * when the browser says marketing consent is on and Conversions API is configured.
 * DRAFT pending legal review.
 */
router.post("/account/attribution", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const marketingConsent = body.marketingConsent === true;
  const eventId = text(body.eventId);
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
  if (saved.created && marketingConsent && eventId) {
    try {
      await sendMetaEvent({
        eventName: "CompleteRegistration",
        eventId,
        userId: req.userId!,
        fbc: text(body.fbc),
        fbp: text(body.fbp),
      });
    } catch (err) {
      logger.warn({ err }, "attribution: conversions api registration was not sent");
    }
  }
  res.json({ created: saved.created });
});

export default router;
