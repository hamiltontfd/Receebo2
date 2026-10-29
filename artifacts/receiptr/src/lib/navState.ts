/**
 * Small in-memory state shared by the tab bar, the Add sheet and Scan.
 * - lastTab: where the camera's X returns to (Search or Stats).
 * - pending upload: a file picked from the Add sheet's "Upload file", handed
 *   to /scan, which runs the same upload + "Reading receipt" flow as before.
 */
export type MainTab = "/search" | "/stats";

let lastTab: MainTab = "/search";

export function tabForPath(path: string): MainTab | null {
  if (path === "/search" || path.startsWith("/search/")) return "/search";
  if (path === "/stats" || path.startsWith("/stats/")) return "/stats";
  return null;
}

export function rememberTab(path: string): void {
  const tab = tabForPath(path);
  if (tab) lastTab = tab;
}

export function getLastTab(): MainTab {
  return lastTab;
}

let pendingUpload: File | null = null;

export function setPendingUpload(file: File | null): void {
  pendingUpload = file;
}

/** Returns the handed-over file once, then clears it. */
export function takePendingUpload(): File | null {
  const f = pendingUpload;
  pendingUpload = null;
  return f;
}

export function hasPendingUpload(): boolean {
  return pendingUpload !== null;
}

/** Routes that hide the mobile tab bar (the full-screen camera owns the screen). */
export function hidesTabBar(path: string): boolean {
  return path === "/scan" || path.startsWith("/scan/");
}

/** Sub-pages reached from the avatar: Back link, tab bar with no active tab. */
export function subPageFor(path: string): { title: string; back: string | null } | null {
  if (path === "/profile/recurring") return { title: "Recurring suppliers", back: "/profile" };
  if (path === "/profile") return { title: "Profile", back: null };
  if (path === "/settings") return { title: "Settings", back: "/profile" };
  return null;
}
