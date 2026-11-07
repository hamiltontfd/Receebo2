/** Public founding offers. The default schema stays EUR. /us swaps in the USD amounts after load. */
export const PUBLIC_PLANS = [
  { key: "monthly", price: "2.99", currency: "EUR", billingDuration: "P1M" },
  { key: "yearly", price: "24.99", currency: "EUR", billingDuration: "P1Y" },
] as const;

/** Same plans, US market currency options. Not a second product. */
export const US_PUBLIC_PLANS = [
  { key: "monthly", price: "3.50", currency: "USD", billingDuration: "P1M" },
  { key: "yearly", price: "28.50", currency: "USD", billingDuration: "P1Y" },
] as const;

export function formatPublicPrice(plan: (typeof PUBLIC_PLANS)[number]) {
  return `€${plan.price}`;
}

type OfferNode = {
  "@type"?: string;
  offers?: Array<{
    price?: string;
    priceCurrency?: string;
    priceSpecification?: { price?: string; priceCurrency?: string; billingDuration?: string };
  }>;
};

/** Replace EUR offers in a parsed JSON-LD graph with the fixed USD amounts. */
export function withUsOffers<T extends { "@graph"?: OfferNode[] }>(schema: T): T {
  const copy = structuredClone(schema);
  const app = copy["@graph"]?.find((node) => node["@type"] === "WebApplication");
  if (!app?.offers || app.offers.length !== US_PUBLIC_PLANS.length) return schema;
  app.offers.forEach((offer, index) => {
    const plan = US_PUBLIC_PLANS[index]!;
    offer.price = plan.price;
    offer.priceCurrency = plan.currency;
    if (offer.priceSpecification) {
      offer.priceSpecification.price = plan.price;
      offer.priceSpecification.priceCurrency = plan.currency;
      offer.priceSpecification.billingDuration = plan.billingDuration;
    }
  });
  return copy;
}
