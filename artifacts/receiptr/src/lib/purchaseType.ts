/**
 * Purchase types (mirror of api-server lib/purchaseType.ts). Subscriptions,
 * one-off digital purchases (apps, films, in-app), event tickets and services
 * get no return window, no legal or manufacturer warranty and no reminders.
 */
export type PurchaseType = "goods" | "subscription" | "digital" | "service" | "ticket";

export function hasNoConsumerDates(type: string | null | undefined): type is Exclude<PurchaseType, "goods"> {
  return type === "subscription" || type === "digital" || type === "service" || type === "ticket";
}
