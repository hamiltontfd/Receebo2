import { afterEach, describe, expect, it } from "vitest";
import { billingCurrencyForMarket, billingPriceId, effectiveBillingCurrency, priceMatchesPlan } from "./billingConfig";

const KEYS = ["STRIPE_TEST_MONTHLY_PRICE_ID", "STRIPE_TEST_YEARLY_PRICE_ID", "STRIPE_TEST_MONTHLY_PRICE_ID_BRL", "STRIPE_TEST_YEARLY_PRICE_ID_BRL"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
function setEnv(brl: boolean) {
  process.env.STRIPE_TEST_MONTHLY_PRICE_ID = "price_eur_m";
  process.env.STRIPE_TEST_YEARLY_PRICE_ID = "price_eur_y";
  if (brl) { process.env.STRIPE_TEST_MONTHLY_PRICE_ID_BRL = "price_brl_m"; process.env.STRIPE_TEST_YEARLY_PRICE_ID_BRL = "price_brl_y"; }
  else { delete process.env.STRIPE_TEST_MONTHLY_PRICE_ID_BRL; delete process.env.STRIPE_TEST_YEARLY_PRICE_ID_BRL; }
}

describe("billing price selection", () => {
  it("only BR is priced in BRL", () => {
    expect(billingCurrencyForMarket("BR")).toBe("BRL");
    for (const m of ["PT", "US", null, undefined]) expect(billingCurrencyForMarket(m)).toBe("EUR");
  });
  it("BR uses the BRL price ids; others use EUR", () => {
    setEnv(true);
    expect(billingPriceId("monthly", "BR")).toBe("price_brl_m");
    expect(billingPriceId("yearly", "BR")).toBe("price_brl_y");
    expect(billingPriceId("monthly", "PT")).toBe("price_eur_m");
    expect(billingPriceId("yearly")).toBe("price_eur_y");
    expect(effectiveBillingCurrency("BR")).toBe("BRL");
  });
  it("BR falls back to EUR when the BRL price is missing", () => {
    setEnv(false);
    expect(billingPriceId("monthly", "BR")).toBe("price_eur_m");
    expect(effectiveBillingCurrency("BR")).toBe("EUR");
  });
  it("validates amounts per currency", () => {
    expect(priceMatchesPlan({ currency: "eur", unit_amount: 299 }, "monthly")).toBe(true);
    expect(priceMatchesPlan({ currency: "eur", unit_amount: 2499 }, "yearly")).toBe(true);
    expect(priceMatchesPlan({ currency: "brl", unit_amount: 2000 }, "monthly")).toBe(true);
    expect(priceMatchesPlan({ currency: "brl", unit_amount: 20000 }, "yearly")).toBe(true);
    expect(priceMatchesPlan({ currency: "brl", unit_amount: 299 }, "monthly")).toBe(false);
    expect(priceMatchesPlan({ currency: "eur", unit_amount: 2000 }, "monthly")).toBe(false);
    expect(priceMatchesPlan({ currency: "usd", unit_amount: 299 }, "monthly")).toBe(false);
  });
});
