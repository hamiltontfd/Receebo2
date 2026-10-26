import { db, trialFunnelSubjectsTable, trialFunnelEventsTable, trialFunnelCheckoutsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export type FunnelInterval = "monthly" | "yearly";
export type PaywallReason = "trial_expired" | "trial_exhausted";
export function paywallReason(state?: string): PaywallReason | null {
  return state === "trial_expired" || state === "trial_exhausted" ? state : null;
}

/** Only newly observed no-card trials belong in this funnel, not legacy Stripe trials. */
export async function funnelSubject(userId: string) {
  const [row] = await db.select({ id: trialFunnelSubjectsTable.id })
    .from(trialFunnelSubjectsTable)
    .innerJoin(trialFunnelEventsTable, and(
      eq(trialFunnelEventsTable.subjectId, trialFunnelSubjectsTable.id),
      eq(trialFunnelEventsTable.event, "account_trial_started"),
    )).where(eq(trialFunnelSubjectsTable.userId, userId));
  return row?.id;
}

export async function recordFunnelEvent(subjectId: string, event: "paywall_viewed" | "plan_selected" | "checkout_canceled" | "paid_activation_confirmed",
  dimension = "none", interval: FunnelInterval | null = null, reason: PaywallReason | null = null) {
  await db.insert(trialFunnelEventsTable).values({ subjectId, event, dimension, interval, reason }).onConflictDoNothing();
}

/** Analytics errors must not interrupt billing; no errors/identity/content logged. */
export async function safeFunnel(operation: () => Promise<unknown>) {
  try { await operation(); } catch { logger.warn("Trial funnel write failed"); }
}

export async function createFunnelCheckout(userId: string, interval: FunnelInterval, reason: PaywallReason | null) {
  const subjectId = await funnelSubject(userId);
  if (!subjectId) return null;
  const [attempt] = await db.insert(trialFunnelCheckoutsTable).values({ subjectId, interval, reason }).returning();
  return attempt.id;
}

/** Polling and verified webhooks share this DB-unique, first-paid milestone.
 * Require a positive paid invoice, not a redirect, access grace, or a free Stripe trial.
 */
export async function confirmPaidFunnel(userId: string) {
  const subjectId = await funnelSubject(userId);
  if (!subjectId) return;
  const result = await db.execute(sql`
    SELECT s.items->'data'->0->'price'->'recurring'->>'interval' AS interval
    FROM stripe.subscriptions s
    JOIN user_billing b ON b.stripe_customer_id = s.customer
    JOIN stripe.invoices i ON i.customer = s.customer
    WHERE b.user_id = ${userId} AND s.livemode = ${process.env.NODE_ENV === "production"}
      AND i.livemode = s.livemode AND i.status = 'paid' AND i.amount_paid > 0
      AND (to_jsonb(i)->'_raw_data'->'parent'->'subscription_details'->>'subscription' = s.id
        OR to_jsonb(i)->>'subscription' = s.id)
      AND s.status = 'active'
      AND COALESCE(s.metadata->>'offer','') = 'founding_customer'
    ORDER BY i.created ASC LIMIT 1
  `);
  const interval = result.rows[0]?.interval;
  if (interval === "month" || interval === "year") {
    await recordFunnelEvent(subjectId, "paid_activation_confirmed", "none", interval === "month" ? "monthly" : "yearly");
  }
}
