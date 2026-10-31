import { createRequire } from "node:module";
import ipaddr from "ipaddr.js";

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
