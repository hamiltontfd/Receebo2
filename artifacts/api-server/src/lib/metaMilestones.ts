import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Response } from "express";
import { marketingConsentFor } from "./adAttributionStore";
import { sendMetaEvent } from "./metaCapi";
import { logger } from "./logger";

export type MetaMilestone = { name: "CompleteRegistration" | "FirstReceiptSaved"; eventId: string };

/** Identity is used only for consent and CAPI's hashed matching id, never custom_data. */
export async function sendMilestone(userId: string, name: MetaMilestone["name"]): Promise<MetaMilestone | undefined> {
  try {
    if (!(await marketingConsentFor(userId))) return;
    const eventId = randomUUID();
    try {
      await sendMetaEvent({ eventName: name, eventId, userId });
    } catch {
      logger.warn("Meta milestone delivery failed");
    }
    return { name, eventId };
  } catch {
    // Measurement failure must not prevent starting a trial or saving a receipt.
    logger.warn("Meta milestone consent lookup failed");
    return;
  }
}

export function returnMetaMilestone(res: Response, event: MetaMilestone | undefined) {
  if (event) res.setHeader("X-Receebo-Meta-Event", JSON.stringify(event));
}

async function hasFirstReceipt(userId: string): Promise<boolean | undefined> {
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM trial_funnel_events e
      JOIN trial_funnel_subjects s ON s.id = e.subject_id
      WHERE s.user_id = ${userId} AND e.event = 'first_receipt_succeeded'
        AND e.dimension = 'none' LIMIT 1`);
    return result.rows.length > 0;
  } catch {
    logger.warn("Meta first receipt milestone lookup failed");
    return undefined;
  }
}

/**
 * Caller holds the existing per-user data lock across this entire operation.
 * Observe the existing trigger's unique milestone; no new writes or backfill.
 * Delivery happens only after the operation's transaction committed.
 */
export async function withFirstReceiptEvent<T>(userId: string, operation: () => Promise<T>) {
  const before = await hasFirstReceipt(userId);
  const value = await operation();
  const event = before === false && await hasFirstReceipt(userId) === true
    ? await sendMilestone(userId, "FirstReceiptSaved") : undefined;
  return { value, event };
}
