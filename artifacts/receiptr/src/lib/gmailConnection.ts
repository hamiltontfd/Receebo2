export async function getGmailConnectionUrl(base: string): Promise<string> {
  // Fetching JSON also works with older installed service workers that
  // incorrectly intercept top-level API navigations.
  const res = await fetch(`${base}api/gmail/connect-url`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Could not start the Gmail connection. Please try again.");
  }
  const data: { url?: unknown } = await res.json();
  if (typeof data.url !== "string") {
    throw new Error("The Gmail connection returned an invalid address.");
  }
  const url = new URL(data.url);
  if (url.origin !== "https://accounts.google.com") {
    throw new Error("The Gmail connection returned an unexpected address.");
  }
  return url.href;
}
