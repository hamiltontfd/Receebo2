// API navigations (including OAuth redirects) must reach the server, never
// the cached app shell. Also support apps mounted under a preview prefix.
export const apiNavigationDenylist = [/\/api(?:\/|$)/];
