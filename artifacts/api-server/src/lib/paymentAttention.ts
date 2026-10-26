import type Stripe from "stripe";
import { db, paymentNoticesTable, userBillingTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { sendPaymentAttentionEmail } from "./emailService";
import { hasOwnerAccess } from "./ownerAccess";

export function paymentAccessMessage(periodEnd: Date | null, now = new Date()): string {
  return periodEnd && periodEnd > now
    ? `Your Pro access continues until ${periodEnd.toUTCString()}. Update your payment details before then to avoid losing access.`
    : "Your Pro access has ended. Update your payment details and settle the outstanding invoice to restore access.";
}

/** Called only after the webhook's authoritative signature verification. */
export async function notifyPaymentFailure(eventInvoice: Stripe.Invoice): Promise<void> {
  if (!eventInvoice.id || eventInvoice.billing_reason !== "subscription_cycle") return;
  if (eventInvoice.livemode !== (process.env.NODE_ENV === "production")) return;
  const stripe = await getUncachableStripeClient();
  // Never trust an old failure snapshot after recovery, cancellation, or replacement.
  const invoice = await stripe.invoices.retrieve(eventInvoice.id);
  const ref = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof ref === "string" ? ref : ref?.id;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!subscriptionId || !customerId || invoice.status !== "open" ||
    invoice.amount_remaining <= 0 || invoice.billing_reason !== "subscription_cycle" ||
    invoice.livemode !== eventInvoice.livemode) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const latestInvoice = typeof subscription.latest_invoice === "string"
    ? subscription.latest_invoice : subscription.latest_invoice?.id;
  const subCustomer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (subCustomer !== customerId || subscription.livemode !== invoice.livemode ||
    !["past_due", "unpaid"].includes(subscription.status) || latestInvoice !== invoice.id) return;
  // A trial conversion or initial purchase is not a failed paid renewal.
  const paid = await stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 100 });
  if (!paid.data.some(previous => previous.amount_paid > 0 && previous.id !== invoice.id)) return;
  const [billing] = await db.select().from(userBillingTable)
    .where(eq(userBillingTable.stripeCustomerId, customerId));
  if (!billing || (billing.stripeSubscriptionId && billing.stripeSubscriptionId !== subscriptionId)) return;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const endAt = periodEnd ? new Date(periodEnd * 1000) : null;
  const message = await hasOwnerAccess(billing.userId)
    ? "Your Owner access is unchanged, but your subscription has an outstanding payment."
    : paymentAccessMessage(endAt);

  // Serialize duplicate events across workers. Rollback on failure lets Stripe retry.
  // Resend's stable idempotency key also covers a crash after provider acceptance.
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`payment-notice:${invoice.id}`}))`);
    const [sent] = await tx.select().from(paymentNoticesTable)
      .where(eq(paymentNoticesTable.invoiceId, invoice.id));
    if (sent) return;
    await sendPaymentAttentionEmail(billing.userId, invoice.id, message);
    await tx.insert(paymentNoticesTable).values({ invoiceId: invoice.id, userId: billing.userId });
  });
}
