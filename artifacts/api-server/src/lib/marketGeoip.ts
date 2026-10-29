import { createRequire } from "node:module";
import ipaddr from "ipaddr.js";
import { logger } from "./logger";

export type Market = "PT" | "BR" | "US";
// EU members, not EEA, and not all countries that use EUR.
const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
export function marketForCountry(country: string | null | undefined): Market | null {
  const code = country?.toUpperCase();
  if (code === "BR" || code === "US") return code;
  return code && EU.has(code) ? "PT" : null;
}

function parseIp(value: string) {
  try {
    const ip = ipaddr.parse(value);
    return ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress()
      ? (ip as ipaddr.IPv6).toIPv4Address() : ip;
  } catch { return null; }
}

/** Only explicit operator-verified proxy networks are trusted. Never trust a hop count. */
export function clientPublicIp(
  remoteAddress: string | undefined,
  forwarded: string | string[] | undefined,
  trustedCidrs = process.env.MARKET_TRUSTED_PROXY_CIDRS ?? "",
): string | null {
  const networks = trustedCidrs.split(",").filter(Boolean).map((cidr) => {
    try { return ipaddr.parseCIDR(cidr.trim()); } catch { return null; }
  }).filter((network): network is [ipaddr.IPv4 | ipaddr.IPv6, number] => network !== null);
  const trusted = (ip: ipaddr.IPv4 | ipaddr.IPv6) => networks.some(([net, bits]) =>
    ip.kind() === net.kind() && ip.match(net, bits));
  let current = parseIp(remoteAddress ?? "");
  if (!current) return null;
  // An untrusted peer cannot supply its own IP, even through any other header.
  if (trusted(current)) {
    if (typeof forwarded !== "string" || forwarded.length > 2048) return null;
    const chain = forwarded.split(",").map((part) => parseIp(part.trim()));
    if (!chain.length || chain.length > 16 || chain.some((ip) => !ip)) return null;
    for (let i = chain.length - 1; i >= 0 && trusted(current); i--) current = chain[i]!;
    if (trusted(current)) return null;
  }
  return current.range() === "unicast" ? current.toString() : null;
}

/** Countries Receebo covers today (Hamilton 2 Nov 2026). EU members other than PT map to the PT/EU
 * market for rules, but are not "covered": they see the uncovered-country notice. */
export const COVERED_COUNTRIES: ReadonlySet<string> = new Set(["PT", "BR", "US"]);
export function isCoveredCountry(country: string | null | undefined): boolean {
  return !!country && COVERED_COUNTRIES.has(country.toUpperCase());
}

/**
 * Dev/test only: pretend the request came from this ISO country (e.g. "US",
 * "JP") because the workspace proxy never exposes a public client IP. Ignored
 * when NODE_ENV is "production".
 */
export function devCountryOverride(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV === "production") return null;
  const value = env.MARKET_DEV_COUNTRY?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) ? value : null;
}

let loggedPeerShape = false;
/**
 * Server-side country for a request: dev override, else local GeoIP of the
 * public client IP (only through MARKET_TRUSTED_PROXY_CIDRS). The IP is never
 * stored or logged; once per process we log only the *kind* of untrusted peer
 * address (e.g. "private", "linkLocal") so the operator can set the proxy CIDRs.
 */
export function requestCountry(req: { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> }): { country: string | null; market: Market | null } {
  const forced = devCountryOverride();
  if (forced) return { country: forced, market: marketForCountry(forced) };
  const ip = clientPublicIp(req.socket.remoteAddress, req.headers["x-forwarded-for"]);
  if (!ip && !loggedPeerShape) {
    loggedPeerShape = true;
    const peer = parseIp(req.socket.remoteAddress ?? "");
    // Range kind only (no address): helps decide MARKET_TRUSTED_PROXY_CIDRS at publish.
    logger.info({ peerRange: peer ? peer.range() : "invalid", forwarded: req.headers["x-forwarded-for"] ? "present" : "absent" }, "Market GeoIP: no public client IP (set MARKET_TRUSTED_PROXY_CIDRS after verifying the proxy path)");
  }
  return suggestMarket(ip);
}

type Lookup = (ip: string) => { country: string } | null;
let localLookup: Lookup | undefined;
export function suggestMarket(ip: string | null, lookup?: Lookup): { country: string | null; market: Market | null } {
  if (!ip) return { country: null, market: null };
  try {
    // Lazy require: a missing/damaged database is unknown, not a server startup failure.
    if (!lookup) localLookup ??= (createRequire(import.meta.url)("geoip-country") as { lookup: Lookup }).lookup;
    const country = (lookup ?? localLookup!)(ip)?.country ?? null;
    return { country, market: marketForCountry(country) };
  } catch { return { country: null, market: null }; }
}
