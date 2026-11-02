// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { createMarketingSchema, marketingSchemaPlugin } from "../../build/marketingSchema";
import { PUBLIC_PLANS, formatPublicPrice } from "./publicPricing";

describe("public product identity", () => {
  it("connects the canonical website and application without unsupported claims", () => {
    const schema = createMarketingSchema("https://receebo.net");
    const [site, app] = schema["@graph"];
    expect(schema["@context"]).toBe("https://schema.org");
    expect(site).toMatchObject({
      "@id": "https://receebo.net/#website",
      about: { "@id": "https://receebo.net/#application" },
    });
    expect(app).toMatchObject({
      "@type": "WebApplication",
      "@id": "https://receebo.net/#application",
      name: "Receebo",
      url: "https://receebo.net/",
    });
    const json = JSON.stringify(schema);
    for (const unsupported of ["aggregateRating", "review", "award", "downloadUrl", "publisher"]) {
      expect(json).not.toContain(`"${unsupported}"`);
    }
  });

  it("uses the visible EUR prices and the full monthly/yearly billing periods", () => {
    const app = createMarketingSchema("https://receebo.net/")["@graph"][1];
    expect(app.offers).toHaveLength(2);
    expect(PUBLIC_PLANS.map(formatPublicPrice)).toEqual(["€2.99", "€24.99"]);
    app.offers!.forEach((offer, i) => {
      const plan = PUBLIC_PLANS[i];
      expect(offer).toMatchObject({
        price: plan.price,
        priceCurrency: "EUR",
        priceSpecification: {
          price: plan.price,
          priceCurrency: "EUR",
          billingDuration: i === 0 ? "P1M" : "P1Y",
        },
      });
    });
  });

  it("emits a standalone JSON-LD script in initial HTML, before React runs", async () => {
    const server = await createServer({
      configFile: false,
      plugins: [marketingSchemaPlugin("https://receebo.net/")],
      server: { middlewareMode: true },
    });
    try {
      const source = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
      const html = await server.transformIndexHtml("/", source);
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks).toHaveLength(1);
      expect(JSON.parse(blocks[0][1])).toEqual(createMarketingSchema("https://receebo.net/"));
      expect(html).not.toContain("<!-- receebo:structured-data -->");
    } finally {
      await server.close();
    }
  });
});
