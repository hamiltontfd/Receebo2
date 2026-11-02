/**
 * Smile rating links from lifecycle emails (spec §3, option A).
 *
 * GET  /feedback/r/:token?v=good|ok|bad  page only, writes NOTHING (mail
 *      scanners and prefetchers open links on their own). JS POSTs after
 *      ~300 ms; <noscript> shows a Confirm button.
 * POST /feedback          {token, v}        UPSERT, last click wins.
 * POST /feedback/comment  {token, comment}  optional, 1000 chars, rate limited.
 *
 * Pages: noindex, Cache-Control no-store, no referrer, no analytics; the
 * token is never logged (app.ts redacts it from the request log path).
 */
import { Router, type IRouter, type Response } from "express";
import { randomBytes } from "crypto";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { isFeedbackRating, verifyFeedbackToken } from "../lib/feedbackToken";
import { recordFeedbackRating, saveFeedbackComment, FEEDBACK_COMMENT_MAX } from "../lib/lifecycleEmailStore";
import {
  renderCommentDonePage, renderLinkProblemPage, renderRatingConfirmPage, renderRatingThanksPage, tokenFingerprint,
} from "../lib/feedbackPages";
import { appUrl } from "../lib/emailService";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function pageHeaders(res: Response, nonce?: string): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; ${nonce ? `script-src 'nonce-${nonce}'; ` : ""}form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  res.type("html");
}

const ratingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
});

const commentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${tokenFingerprint((req.body as { token?: unknown } | undefined)?.token)}`,
});

router.get("/feedback/r/:token", (req, res): void => {
  const token = String(req.params.token ?? "");
  const verified = verifyFeedbackToken(token);
  if (!verified.ok) {
    pageHeaders(res);
    res.status(verified.reason === "expired" ? 410 : 400).send(renderLinkProblemPage(verified.locale ?? "en", verified.reason));
    return;
  }
  const v = req.query.v;
  const rating = isFeedbackRating(v) ? v : null;
  if (!rating) {
    pageHeaders(res);
    res.status(400).send(renderLinkProblemPage(verified.payload.locale, "invalid"));
    return;
  }
  const nonce = randomBytes(16).toString("base64");
  pageHeaders(res, nonce);
  res.status(200).send(renderRatingConfirmPage({ locale: verified.payload.locale, token, rating, nonce }));
});

router.post("/feedback", ratingLimiter, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { token?: unknown; v?: unknown };
  const verified = verifyFeedbackToken(body.token);
  const wantsJson = req.is("application/json") === "application/json";
  if (!verified.ok) {
    if (wantsJson) { res.status(verified.reason === "expired" ? 410 : 400).json({ error: verified.reason }); return; }
    pageHeaders(res);
    res.status(verified.reason === "expired" ? 410 : 400).send(renderLinkProblemPage(verified.locale ?? "en", verified.reason));
    return;
  }
  const v = Array.isArray(body.v) ? body.v[body.v.length - 1] : body.v;
  if (!isFeedbackRating(v)) {
    if (wantsJson) { res.status(400).json({ error: "invalid_rating" }); return; }
    pageHeaders(res);
    res.status(400).send(renderLinkProblemPage(verified.payload.locale, "invalid"));
    return;
  }
  const { userId, emailType, emailSendId, locale } = verified.payload;
  try {
    const saved = await recordFeedbackRating({ userId, emailType, emailSendId, rating: v, locale });
    if (wantsJson) { res.status(200).json(saved); return; }
    pageHeaders(res);
    res.status(200).send(renderRatingThanksPage({ locale, token: String(body.token), rating: saved.rating }));
  } catch (err) {
    logger.error({ err, emailType }, "Feedback rating could not be saved");
    res.status(500).json({ error: "Could not save" });
  }
});

router.post("/feedback/comment", commentLimiter, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { token?: unknown; comment?: unknown };
  const verified = verifyFeedbackToken(body.token);
  if (!verified.ok) {
    pageHeaders(res);
    res.status(verified.reason === "expired" ? 410 : 400).send(renderLinkProblemPage(verified.locale ?? "en", verified.reason));
    return;
  }
  const { userId, emailType, emailSendId, locale } = verified.payload;
  const comment = typeof body.comment === "string" ? body.comment : "";
  if (comment.length > FEEDBACK_COMMENT_MAX) {
    pageHeaders(res);
    res.status(400).send(renderLinkProblemPage(locale, "invalid"));
    return;
  }
  try {
    const saved = await saveFeedbackComment({ userId, emailType, emailSendId, comment });
    pageHeaders(res);
    if (!saved) { res.status(404).send(renderLinkProblemPage(locale, "invalid")); return; }
    res.status(200).send(renderCommentDonePage(locale, appUrl()));
  } catch (err) {
    logger.error({ err, emailType }, "Feedback comment could not be saved");
    res.status(500).json({ error: "Could not save" });
  }
});

export default router;
