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

/**
 * Google Front End proxies in front of a global external Application Load Balancer.
 * Published as "GFE proxy ranges" in
 * https://cloud.google.com/load-balancing/docs/firewall-rules
 * (checked 6 Nov 2026). These sit inside goog.json parents (35.184.0.0/13 and
 * 130.211.0.0/16) but are not customer ranges in cloud.json.
 * 130.211.48.0/20 + 130.211.64.0/19 + 130.211.96.0/20 are the rest of Google's
 * own 130.211.0.0/16 (goog.json, absent from cloud.json) that geoip-country
 * 5.0.20261028 places in BE — europe-west1, where Replit's edge hop showed up.
 * They do not authorize reading X-Forwarded-For; only MARKET_TRUSTED_PROXY_CIDRS does.
 */
export const GOOGLE_EDGE_CIDRS = [
  "35.191.0.0/16",
  "130.211.0.0/22",
  "2600:2d00:1:1::/64",
  "130.211.48.0/20",
  "130.211.64.0/19",
  "130.211.96.0/20",
] as const;

type Network = [ipaddr.IPv4 | ipaddr.IPv6, number];
function parseNetworks(cidrs: readonly string[]): Network[] {
  return cidrs.map((cidr) => {
    try { return ipaddr.parseCIDR(cidr.trim()); } catch { return null; }
  }).filter((network): network is Network => network !== null);
}
const GOOGLE_EDGE = parseNetworks(GOOGLE_EDGE_CIDRS);
const matches = (ip: ipaddr.IPv4 | ipaddr.IPv6, networks: Network[]) => networks.some(([net, bits]) =>
  ip.kind() === net.kind() && ip.match(net, bits));

export type HopKind = "trusted" | "google" | "client" | "other";
export type ChainShape = { hops: number; kinds: HopKind[]; countries: Array<string | null> };

function hopKind(ip: ipaddr.IPv4 | ipaddr.IPv6, trustedNets: Network[]): HopKind {
  if (matches(ip, GOOGLE_EDGE)) return "google";
  if (matches(ip, trustedNets)) return "trusted";
  return ip.range() === "unicast" ? "client" : "other";
}
const skipHop = (ip: ipaddr.IPv4 | ipaddr.IPv6, trustedNets: Network[]) => {
  const kind = hopKind(ip, trustedNets);
  return kind === "trusted" || kind === "google";
};

let loggedChainShape = false;
function logChainShape(shape: ChainShape) {
  if (loggedChainShape) return;
  loggedChainShape = true;
  // Kinds and country codes only. Never the addresses.
  logger.info({ hops: shape.hops, kinds: shape.kinds, countries: shape.countries }, "Market GeoIP chain shape");
}

/** Only explicit operator-verified proxy networks may open X-Forwarded-For. Never trust a hop count. */
export function clientPublicIp(
  remoteAddress: string | undefined,
  forwarded: string | string[] | undefined,
  trustedCidrs = process.env.MARKET_TRUSTED_PROXY_CIDRS ?? "",
): string | null {
  const networks = parseNetworks(trustedCidrs.split(",").filter(Boolean));
  const trusted = (ip: ipaddr.IPv4 | ipaddr.IPv6) => matches(ip, networks);
  let current = parseIp(remoteAddress ?? "");
  if (!current) return null;
  // An untrusted peer cannot supply its own IP, even through any other header.
  // Google edge ranges are skipped inside an already-trusted walk; they do not start one.
  if (trusted(current)) {
    if (typeof forwarded !== "string" || forwarded.length > 2048) return null;
    const chain = forwarded.split(",").map((part) => parseIp(part.trim()));
    if (!chain.length || chain.length > 16 || chain.some((ip) => !ip)) return null;
    const hops = chain as Array<ipaddr.IPv4 | ipaddr.IPv6>;
    logChainShape({
      hops: hops.length,
      kinds: hops.map((ip) => hopKind(ip, networks)),
      countries: hops.map((ip) => ip.range() === "unicast" ? suggestMarket(ip.toString()).country : null),
    });
    for (let i = hops.length - 1; i >= 0 && skipHop(current, networks); i--) current = hops[i]!;
    if (skipHop(current, networks)) return null;
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
