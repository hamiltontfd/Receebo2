import { describe, expect, it } from "vitest";
import { clientPublicIp, marketForCountry, suggestMarket } from "./marketGeoip";
import { validPurchaseCountry } from "./purchaseCountry";
import { detectCountry, calcReturnWindow } from "./returnWindowCalc";
import { computeWarrantyExpiries } from "./warrantyExpiry";

describe("local GeoIP and market mapping", () => {
  it.each(["PT", "DE", "FR", "IE", "BG", "CY", "SE"])("suggests PT/EU for member %s", (code) => {
    expect(marketForCountry(code)).toBe("PT");
  });
  it("maps Brazil and US, never maps unsupported/unknown countries or EUR areas to PT", () => {
    expect(marketForCountry("BR")).toBe("BR");
    expect(marketForCountry("US")).toBe("US");
    for (const code of [null, undefined, "", "GB", "NO", "CH", "JP", "XK"]) expect(marketForCountry(code)).toBeNull();
  });
  it("queries the installed local IPv4 and IPv6 database, without HTTP", () => {
    expect(suggestMarket("8.8.8.8")).toEqual({ country: "US", market: "US" });
    expect(suggestMarket("2001:4860:4860::8888")).toEqual({ country: "US", market: "US" });
  });
  it("fails unknown for lookup failure, unavailable database result and no IP", () => {
    expect(suggestMarket("8.8.8.8", () => { throw new Error("db unavailable"); })).toEqual({ country: null, market: null });
    expect(suggestMarket("8.8.8.8", () => null)).toEqual({ country: null, market: null });
    expect(suggestMarket(null)).toEqual({ country: null, market: null });
    expect(suggestMarket("8.8.8.8", () => ({ country: "JP" }))).toEqual({ country: "JP", market: null });
  });
});

describe("proxy trust boundary", () => {
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::1", "fc00::1", "fe80::1", "2001:db8::1", "bad", "0.0.0.0", "::ffff:127.0.0.1"])("does not geolocate private/reserved/invalid %s", (ip) => {
    expect(clientPublicIp(ip, "8.8.8.8", "")).toBeNull();
  });
  it("ignores spoofed forwarding headers from an untrusted public peer", () => {
    expect(clientPublicIp("8.8.8.8", "1.1.1.1", "")).toBe("8.8.8.8");
    expect(clientPublicIp("::ffff:8.8.8.8", "1.1.1.1", "")).toBe("8.8.8.8");
  });
  it("walks verified proxy networks right to left, stopping before attacker-prepended IP", () => {
    expect(clientPublicIp("127.0.0.1", "1.1.1.1, 8.8.8.8, 10.0.0.3", "127.0.0.1/32,10.0.0.3/32")).toBe("8.8.8.8");
  });
  it("fails closed for missing, malformed, all-trusted and oversized chains", () => {
    for (const chain of [undefined, "bad", "8.8.8.8, bad", "127.0.0.1", ["8.8.8.8"], "8.8.8.8,".repeat(300)]) {
      expect(clientPublicIp("127.0.0.1", chain, "127.0.0.1/32")).toBeNull();
    }
  });
});

describe("purchase country is not account market", () => {
  it("validates real countries, including Unknown, rejecting pseudo regions", () => {
    for (const country of ["PT", "BR", "US", "DE", "FR", null, undefined]) expect(validPurchaseCountry(country)).toBe(true);
    for (const country of ["EU", "ZZ", "XX", "pt", "", 1, {}]) expect(validPurchaseCountry(country)).toBe(false);
  });
  it("BR account with PT purchase keeps Portuguese rights, US account with BR keeps Brazilian rules", () => {
    // Extra account fields are deliberately irrelevant to the calculators.
    const pt = { market: "BR", purchaseCountry: "PT", purchaseDate: "2026-01-01", currency: "BRL", isOnlinePurchase: true, category: "Electronics" };
    const br = { market: "US", purchaseCountry: "BR", purchaseDate: "2026-01-01", currency: "USD", isOnlinePurchase: true, category: "Electronics" };
    expect(detectCountry(pt)).toBe("PT");
    expect(calcReturnWindow(pt)?.deadlineDate.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(computeWarrantyExpiries(pt).legal).toBe("2029-01-01");
    expect(detectCountry(br)).toBe("BR");
    expect(calcReturnWindow(br)?.deadlineDate.toISOString().slice(0, 10)).toBe("2026-01-08");
  });
  it("country stays unknown even when currency provides an alternative rules inference", () => {
    const purchase = { purchaseCountry: null, currency: "USD", market: "BR" };
    expect(detectCountry(purchase)).toBe("US");
    expect(purchase.purchaseCountry).toBeNull();
    expect(detectCountry({ purchaseCountry: "DE", currency: "BRL" })).toBe("EU");
  });
});
