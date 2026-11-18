import { CAMPAIGN_PARAMS } from "./adAttribution";

/** Display context only: never a market, billing or consent-country choice. */
export function hasUsLanding(search: string): boolean {
  return new URLSearchParams(search).get("landing") === "us";
}

export function isAuthLandingPath(path: string): boolean {
  return /(?:^|\/)sign-(?:in|up)(?:\/|$)/.test(path.split(/[?#]/)[0]);
}

/** Preserve Clerk step parameters; copy only campaign/display context from the source. */
export function withUsLanding(target: string, search: string, fromUs = false): string {
  if ((!fromUs && !hasUsLanding(search)) || !target.startsWith("/") || target.startsWith("//")) return target;
  const url = new URL(target, "https://auth-context.invalid");
  if (!isAuthLandingPath(url.pathname)) return target;
  const source = new URLSearchParams(search);
  for (const key of CAMPAIGN_PARAMS) {
    const value = source.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  url.searchParams.set("landing", "us");
  return `${url.pathname}${url.search}${url.hash}`;
}
