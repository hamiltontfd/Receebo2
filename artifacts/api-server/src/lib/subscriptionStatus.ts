import { db, userBillingTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hasOwnerAccess } from "./ownerAccess";

export type UserPlan = "free" | "trialing" | "pro";

export interface SubscriptionStatus {
  plan: UserPlan;
  trialEndAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  ownerAccess?: boolean;
  hasBillingAccount?: boolean;
}

const FREE: SubscriptionStatus = {
  plan: "free",
  trialEndAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeSubscriptionId: null,
};

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const ownerAccess = await hasOwnerAccess(userId);
  const status = await getPaidSubscriptionStatus(userId);
  if (!ownerAccess) return status;
  const [billing] = await db
    .select({ stripeSubscriptionId: userBillingTable.stripeSubscriptionId })
    .from(userBillingTable)
    .where(eq(userBillingTable.userId, userId));
  return {
    ...status,
    plan: "pro",
    ownerAccess: true,
    hasBillingAccount: Boolean(billing),
    trialEndAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    // Keep the real subscription reference for account-deletion cancellation.
    stripeSubscriptionId: status.stripeSubscriptionId ?? billing?.stripeSubscriptionId ?? null,
  };
}

async function getPaidSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  if (!userId || userId.startsWith("guest")) return FREE;

  // Development-only bypass: treat every signed-in user as having full access
  // so the app can be tested without a real Stripe subscription. Driven purely
  // by NODE_ENV — production builds always enforce the real paywall.
  if (process.env.NODE_ENV !== "production") {
    return {
      plan: "pro",
      trialEndAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
    };
  }

  const [billing] = await db
    .select({ stripeCustomerId: userBillingTable.stripeCustomerId })
    .from(userBillingTable)
    .where(eq(userBillingTable.userId, userId));

  if (!billing?.stripeCustomerId) return FREE;

  let rows: Array<{
    id: string;
    status: string;
    trial_end: number | null;
    current_period_end: number | null;
    cancel_at_period_end: boolean;
  }>;

  try {
    const result = await db.execute(sql`
      SELECT id, status, trial_end, current_period_end, cancel_at_period_end
      FROM stripe.subscriptions
      WHERE customer = ${billing.stripeCustomerId}
      ORDER BY created DESC
      LIMIT 1
    `);
    rows = result.rows as typeof rows;
  } catch {
    // stripe schema not yet created (Stripe not connected)
    return FREE;
  }

  if (!rows.length) return FREE;

  const sub = rows[0];
  const now = new Date();
  const trialEndAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);

  let plan: UserPlan = "free";

  if (sub.status === "trialing" && trialEndAt && trialEndAt > now) {
    plan = "trialing";
  } else if (sub.status === "active") {
    plan = "pro";
  } else if (
    (sub.status === "past_due" || sub.status === "unpaid") &&
    currentPeriodEnd &&
    currentPeriodEnd > now
  ) {
    // Keep pro access until the current period expires; Stripe will retry payment.
    // "unpaid" is the terminal failure state — also gated by period end.
    plan = "pro";
  } else if (sub.status === "canceled" && currentPeriodEnd && currentPeriodEnd > now) {
    plan = "pro";
  }

  return { plan, trialEndAt, currentPeriodEnd, cancelAtPeriodEnd, stripeSubscriptionId: sub.id };
}
