import { customFetch } from "./custom-fetch";
import type { BillingAccessStatus } from "./generated/api.schemas";

export type UserPlan = "free" | "trialing" | "pro";

export type SubscriptionStatus = BillingAccessStatus;

export async function getSubscriptionStatus(base: string): Promise<SubscriptionStatus> {
  return customFetch<SubscriptionStatus>(`${base}api/billing/subscription`);
}

export async function createCheckoutSession(
  base: string,
  planType: "monthly" | "yearly",
): Promise<{ url: string }> {
  return customFetch<{ url: string }>(`${base}api/billing/create-checkout-session`, {
    method: "POST",
    body: JSON.stringify({ planType }),
  });
}

export async function createPortalSession(base: string): Promise<{ url: string }> {
  return customFetch<{ url: string }>(`${base}api/billing/create-portal-session`, {
    method: "POST",
  });
}
