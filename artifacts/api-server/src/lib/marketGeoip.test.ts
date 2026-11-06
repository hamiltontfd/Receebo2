import { describe, expect, it } from "vitest";
import { clientPublicIp, describeForwardedChain, marketForCountry, suggestMarket } from "./marketGeoip";
import ipaddr from "ipaddr.js";
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
  it("skips a Google edge hop and keeps the Portuguese client, without trusting a direct Google peer", () => {
    const prod = "127.0.0.1/32,::1/128,169.254.0.0/16,34.111.179.208/32,34.117.33.233/32";
    const client = "89.181.171.141";
    const belgiumEdge = "130.211.85.85";
    expect(suggestMarket(client)).toEqual({ country: "PT", market: "PT" });
    expect(suggestMarket(belgiumEdge).country).toBe("BE");
    expect(clientPublicIp("34.111.179.208", `${client}, ${belgiumEdge}`, prod)).toBe(client);
    expect(clientPublicIp("34.117.33.233", `${client}, 35.191.1.1`, prod)).toBe(client);
    expect(clientPublicIp("169.254.8.1", `${client}, 130.211.1.1`, prod)).toBe(client);
    // The edge address is not a trusted peer: its X-Forwarded-For is ignored.
    expect(clientPublicIp(belgiumEdge, client, prod)).toBe(belgiumEdge);
    // A fake address prepended by the client stays to the left of the real client.
    expect(clientPublicIp("127.0.0.1", `1.1.1.1, ${client}, ${belgiumEdge}`, prod)).toBe(client);
    // A direct untrusted peer cannot inject Portugal through the same header.
    expect(clientPublicIp("8.8.8.8", `${client}, ${belgiumEdge}`, prod)).toBe("8.8.8.8");
  });
  it("anchors on the rightmost trusted hop, so a later infra address is not the client", () => {
    const prod = "127.0.0.1/32,::1/128,169.254.0.0/16,34.111.179.208/32,34.117.33.233/32";
    const pt = "89.181.171.141";
    const us = "8.8.8.8";
    const lb = "34.111.179.208";
    const gfe = "35.191.10.10";
    const beInfra = "34.76.0.1";
    const usInfra = "34.149.1.1";
    expect(suggestMarket(beInfra).country).toBe("BE");
    expect(suggestMarket(usInfra).country).toBe("US");
    // US box, no client-supplied prefix: [client, trusted LB, Google GFE, region infra].
    expect(clientPublicIp("127.0.0.1", `${us}, ${lb}, ${gfe}, ${usInfra}`, prod)).toBe(us);
    // Hamilton in Porto: the last hop is a Belgium infra address, not the client.
    expect(clientPublicIp("127.0.0.1", `${pt}, ${lb}, ${gfe}, ${beInfra}`, prod)).toBe(pt);
    expect(suggestMarket(clientPublicIp("127.0.0.1", `${pt}, ${lb}, ${gfe}, ${beInfra}`, prod))).toEqual({ country: "PT", market: "PT" });
    // A spoofed address stays left of the client the load balancer appended.
    expect(clientPublicIp("127.0.0.1", `${beInfra}, ${pt}, ${lb}, ${gfe}, ${usInfra}`, prod)).toBe(pt);
    // No trusted address in the chain: fall back to the right-hand walk (stops on the infra hop).
    expect(clientPublicIp("127.0.0.1", `${pt}, ${gfe}, ${beInfra}`, prod)).toBe(beInfra);
    const parsed = `${us}, ${lb}, ${gfe}, ${usInfra}`.split(", ").map((part) => ipaddr.parse(part));
    const shape = describeForwardedChain(parsed, prod.split(",").map((cidr) => ipaddr.parseCIDR(cidr.trim())));
    expect(shape).toMatchObject({ hops: 4, kinds: ["client", "trusted", "google", "client"], lastPrefix: "34.149.x.x" });
    expect(shape.countries[0]).toBe("US");
    expect(JSON.stringify(shape)).not.toContain(us);
    expect(JSON.stringify(shape)).not.toContain(usInfra);
    expect(JSON.stringify(shape)).not.toContain(lb);
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
