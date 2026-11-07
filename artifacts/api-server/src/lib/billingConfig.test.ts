import { afterEach, describe, expect, it } from "vitest";
import { billingCurrencyForMarket, billingPriceId, describeChargedPlan, effectiveBillingCurrency, priceMatchesPlan, priceMatchesSelection } from "./billingConfig";

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
  it("maps BR to BRL and US to USD; PT and unknown stay EUR", () => {
    expect(billingCurrencyForMarket("BR")).toBe("BRL");
    expect(billingCurrencyForMarket("US")).toBe("USD");
    for (const m of ["PT", null, undefined]) expect(billingCurrencyForMarket(m)).toBe("EUR");
  });
  it("BR uses the BRL price ids; EUR and USD share one id per plan", () => {
    setEnv(true);
    expect(billingPriceId("monthly", "BR")).toBe("price_brl_m");
    expect(billingPriceId("yearly", "BR")).toBe("price_brl_y");
    expect(billingPriceId("monthly", "PT")).toBe("price_eur_m");
    expect(billingPriceId("monthly", "US")).toBe("price_eur_m");
    expect(billingPriceId("yearly", "US")).toBe("price_eur_y");
    expect(billingPriceId("yearly")).toBe("price_eur_y");
    expect(effectiveBillingCurrency("BR")).toBe("BRL");
    expect(effectiveBillingCurrency("US")).toBe("USD");
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
    expect(priceMatchesPlan({ currency: "usd", unit_amount: 350 }, "monthly")).toBe(true);
    expect(priceMatchesPlan({ currency: "usd", unit_amount: 2850 }, "yearly")).toBe(true);
  });
  it("accepts USD only as the currency option on the EUR price, and never as a missing option", () => {
    const shared = {
      active: true, livemode: false, currency: "eur", product: "prod_shared",
      recurring: { interval: "month" as const, interval_count: 1, usage_type: "licensed" as const },
      currency_options: { usd: { unit_amount: 350 } },
    };
    expect(priceMatchesSelection({ ...shared, unit_amount: 299 }, "EUR", "monthly", false)).toBe(true);
    expect(priceMatchesSelection({ ...shared, unit_amount: 299 }, "USD", "monthly", false)).toBe(true);
    expect(priceMatchesSelection({ ...shared, unit_amount: 299, currency_options: {} }, "USD", "monthly", false)).toBe(false);
    expect(priceMatchesSelection({ ...shared, unit_amount: 299, currency_options: { usd: { unit_amount: 299 } } }, "USD", "monthly", false)).toBe(false);
    expect(priceMatchesSelection({ ...shared, unit_amount: 299, recurring: { interval: "year", interval_count: 1 } }, "USD", "monthly", false)).toBe(false);
    expect(priceMatchesSelection({ ...shared, unit_amount: 299, livemode: true }, "USD", "monthly", false)).toBe(false);
    expect(priceMatchesSelection({ ...shared, unit_amount: 299, product: "" }, "USD", "monthly", false)).toBe(false);
    expect(priceMatchesSelection({
      ...shared, unit_amount: 2499, recurring: { interval: "year", interval_count: 1 },
      currency_options: { usd: { unit_amount: 2850 } },
    }, "USD", "yearly", false)).toBe(true);
  });
  it("reads the subscription currency, not the shared Price default", () => {
    expect(describeChargedPlan({
      subscriptionCurrency: "eur", priceCurrency: "eur", priceUnitAmount: 299,
    })).toEqual({ basis: "subscription", currency: "EUR", monthly: 299, yearly: 2499 });
    expect(describeChargedPlan({
      subscriptionCurrency: "usd", priceCurrency: "eur", priceUnitAmount: 299,
    })).toEqual({ basis: "subscription", currency: "USD", monthly: 350, yearly: 2850 });
    expect(describeChargedPlan({
      subscriptionCurrency: null, priceCurrency: "eur", priceUnitAmount: 299,
    })).toEqual({ basis: "unavailable" });
    expect(describeChargedPlan({ subscriptionCurrency: undefined, priceCurrency: "usd", priceUnitAmount: 350 })).toEqual({ basis: "unavailable" });
  });
});
