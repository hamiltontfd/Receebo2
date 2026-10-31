import { normalizeCountry } from "./countries";

type Suggestion = { country: string | null; market: "PT" | "BR" | "US" | null };
const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
const ENDPOINT = "https://api.country.is/";
const CACHE_MS = 10 * 60 * 1000;
let cached: { until: number; value: Suggestion } | undefined;

export function marketForCountry(country: string | null): Suggestion["market"] {
  if (country === "BR" || country === "US") return country;
  return country && EU.has(country) ? "PT" : null;
}

/**
 * Browser-only fallback: the service sees the visitor's network address, not
 * the API server's address. Never send account IDs, cookies, receipts or an IP
 * parameter; discard every response field except the ISO country.
 */
export async function lookupExternalMarket(signal: AbortSignal): Promise<Suggestion> {
  signal.throwIfAborted();
  if (cached && cached.until > Date.now()) return cached.value;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 3000);
  try {
    const response = await fetch(ENDPOINT, {
      signal: abort.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Country lookup unavailable");
    const data: unknown = await response.json();
    const value = data && typeof data === "object" && "country" in data ? data.country : null;
    const country = typeof value === "string" ? normalizeCountry(value) : null;
    if (!country) throw new Error("Country lookup returned no valid country");
    // A response after cancellation must not populate the cache or the UI.
    abort.signal.throwIfAborted();
    const result = { country, market: marketForCountry(country) };
    cached = { until: Date.now() + CACHE_MS, value: result };
    return result;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
