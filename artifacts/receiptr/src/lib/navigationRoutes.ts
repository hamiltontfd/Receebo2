// API navigations (including OAuth redirects) must reach the server, never
// the cached app shell. Also support apps mounted under a preview prefix.
export const apiNavigationDenylist = [/\/api(?:\/|$)/];

// Only known product screens are app-shell navigations. Unknown paths, other
// artifacts, Clerk proxy requests, OAuth callbacks and files must reach network.
export function isAppNavigation(pathname: string, scopePath: string): boolean {
  if (!pathname.startsWith(scopePath)) return false;
  const path = pathname.slice(scopePath.length);
  return /^(?:|search\/?|scan\/?|profile\/?|settings\/?|get-started\/?|privacy\/?|terms\/?|receipts\/\d+\/?)$/.test(path);
}
