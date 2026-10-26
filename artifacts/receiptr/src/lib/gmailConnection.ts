import { getMailConnectionUrl } from "./mailConnection";

/** @deprecated Use getMailConnectionUrl(base, "gmail"). Kept for callers/tests. */
export async function getGmailConnectionUrl(base: string): Promise<string> {
  return getMailConnectionUrl(base, "gmail");
}
