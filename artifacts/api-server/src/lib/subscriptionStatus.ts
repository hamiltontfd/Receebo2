import { db, userBillingTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hasOwnerAccess } from "./ownerAccess";
import { accountTrialStatus } from "./accountTrial";

export type UserPlan = "free" | "trialing" | "pro";

export interface SubscriptionStatus {
  plan: UserPlan;
  trialEndAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  ownerAccess?: boolean;
  hasBillingAccount?: boolean;
  accessState?: "not_started" | "account_trial" | "trial_exhausted" | "trial_expired" | "legacy_stripe_trial" | "paid" | "owner" | "subscription_required";
  trialUploadsRemaining?: number | null;
  trialUploadsUsed?: number;
  foundingEligible?: boolean;
  canUpload?: boolean;
  canUseApp?: boolean;
  reviewReceiptId?: number | null;
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
  const trial = await accountTrialStatus(userId);
  const accessState: NonNullable<SubscriptionStatus["accessState"]> = ownerAccess ? "owner" : status.plan === "pro" ? "paid" :
    status.plan === "trialing" ? "legacy_stripe_trial" : trial?.state ??
      (status.stripeSubscriptionId ? "subscription_required" : "not_started");
  const canUseApp = ["owner", "paid", "legacy_stripe_trial", "account_trial"].includes(accessState);
  const enriched = {
    ...status, accessState, canUseApp,
    canUpload: canUseApp && (accessState !== "account_trial" || (trial?.remaining ?? 0) > 0),
    trialUploadsRemaining: trial ? trial.remaining : null,
    trialUploadsUsed: trial?.used ?? 0,
    foundingEligible: Boolean(trial),
    reviewReceiptId: accessState === "trial_exhausted" || accessState === "trial_expired"
      ? trial?.reviewReceiptId ?? null : null,
    ...(accessState === "account_trial" ? { plan: "trialing" as const, trialEndAt: trial!.trial.endsAt } :
      trial && status.plan === "free" ? { trialEndAt: trial.trial.endsAt } : {}),
  };
  if (!ownerAccess) return enriched;
  const [billing] = await db
    .select({ stripeSubscriptionId: userBillingTable.stripeSubscriptionId })
    .from(userBillingTable)
    .where(eq(userBillingTable.userId, userId));
  return {
    ...enriched,
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

  const [billing] = await db
    .select({ stripeCustomerId: userBillingTable.stripeCustomerId, stripeSubscriptionId: userBillingTable.stripeSubscriptionId })
    .from(userBillingTable)
    .where(eq(userBillingTable.userId, userId));

  if (!billing?.stripeCustomerId) return FREE;
  const inactive: SubscriptionStatus = { ...FREE, hasBillingAccount: true,
    stripeSubscriptionId: billing.stripeSubscriptionId ?? null };

  let rows: Array<{
    id: string;
    status: string;
    trial_end: number | null;
    current_period_end: number | null;
    cancel_at_period_end: boolean;
    cancel_at: number | null;
  }>;

  try {
    const result = await db.execute(sql`
      SELECT id, status, trial_end,
        COALESCE(current_period_end, (items->'data'->0->>'current_period_end')::bigint) AS current_period_end,
        cancel_at_period_end, cancel_at
      FROM stripe.subscriptions
      WHERE customer = ${billing.stripeCustomerId}
        AND livemode = ${process.env.NODE_ENV === "production"}
      ORDER BY created DESC
      LIMIT 1
    `);
    rows = result.rows as typeof rows;
  } catch {
    // stripe schema not yet created (Stripe not connected)
    return inactive;
  }

  if (!rows.length) return inactive;

  const sub = rows[0];
  const now = new Date();
  const trialEndAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
  // Current Stripe portals may schedule cancel_at without setting the legacy flag.
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end || sub.cancel_at);

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

  return { plan, trialEndAt, currentPeriodEnd, cancelAtPeriodEnd, stripeSubscriptionId: sub.id, hasBillingAccount: true };
}
