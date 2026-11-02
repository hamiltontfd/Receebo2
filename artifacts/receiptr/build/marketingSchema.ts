import type { Plugin } from "vite";
import { PUBLIC_PLANS } from "../src/lib/publicPricing";

export function createMarketingSchema(canonicalUrl: string) {
  const url = new URL(canonicalUrl).href;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: "Receebo",
        url,
        about: { "@id": `${url}#application` },
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#application`,
        name: "Receebo",
        url,
        applicationCategory: "UtilitiesApplication",
        description:
          "Scan, upload or import receipts, find purchases, and track warranties and return deadlines with Receebo.",
        mainEntityOfPage: url,
        offers: PUBLIC_PLANS.map((plan) => ({
          "@type": "Offer",
          "@id": `${url}#offer-${plan.key}`,
          name: `Receebo ${plan.key} founding subscription`,
          url,
          price: plan.price,
          priceCurrency: plan.currency,
          description: `Billed ${plan.key === "monthly" ? "monthly" : "yearly"}. Founding prices remain available while your account exists. Cancel renewal anytime.`,
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: plan.price,
            priceCurrency: plan.currency,
            billingDuration: plan.billingDuration,
          },
        })),
      },
    ],
  };
}

export function marketingSchemaPlugin(canonicalUrl: string): Plugin {
  return {
    name: "receebo-marketing-schema",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        // Escape HTML delimiters so even a configured URL cannot end the script.
        const json = JSON.stringify(createMarketingSchema(canonicalUrl)).replace(
          /</g,
          "\\u003c",
        );
        return html.replace(
          "<!-- receebo:structured-data -->",
          `<script type="application/ld+json">${json}</script>`,
        );
      },
    },
  };
}
