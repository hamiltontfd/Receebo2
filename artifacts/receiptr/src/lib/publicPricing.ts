/** Public EUR founding offers; shared by the landing page and initial HTML schema. */
export const PUBLIC_PLANS = [
  { key: "monthly", price: "2.99", currency: "EUR", billingDuration: "P1M" },
  { key: "yearly", price: "24.99", currency: "EUR", billingDuration: "P1Y" },
] as const;

export function formatPublicPrice(plan: (typeof PUBLIC_PLANS)[number]) {
  return `€${plan.price}`;
}
