import { describe, expect, it } from "vitest";
import { isOnlineForConsumerRights, merchantSuggestsOnline } from "@workspace/api-zod";

describe("shared Amazon-only online channel estimate", () => {
  it.each(["Amazon", "AMAZON EU S.à r.l.", "Amazon.es", "Amazon.com.br"])("recognizes merchant %s", merchant => {
    expect(merchantSuggestsOnline(merchant)).toBe(true);
    expect(isOnlineForConsumerRights(null, merchant)).toBe(true);
    expect(isOnlineForConsumerRights(false, merchant)).toBe(false);
  });
  it.each(["amazon.es", "https://www.amazon.com.br/orders", "smile.amazon.co.uk"])("recognizes storefront %s", domain => {
    expect(isOnlineForConsumerRights(undefined, "Marketplace", domain)).toBe(true);
    expect(isOnlineForConsumerRights(false, "Marketplace", domain)).toBe(false);
  });
  it.each(["amazon.es.evil.example", "notamazon.es", "fnac.pt", "zara.com"])("does not infer online from %s", domain => {
    expect(merchantSuggestsOnline("Marketplace", domain)).toBe(false);
  });
  it.each(["Zara", "Fnac", "Unknown merchant", null])("keeps an unknown channel at %s", merchant => {
    expect(isOnlineForConsumerRights(null, merchant)).toBe(false);
    expect(isOnlineForConsumerRights(true, merchant)).toBe(true);
  });
});
